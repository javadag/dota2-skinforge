/**
 * SkinForge bug-report relay (Cloudflare Worker)
 *
 * The desktop app POSTs a sanitised report here; this Worker owns the GitHub token and creates the
 * issue. The token exists only as a Worker secret, never in the app, the repo or any response.
 *
 * Request pipeline: method/size -> rate limit -> validate -> duplicate check -> screenshot upload -> create issue.
 */

import {
  BUG_REPORT_LABELS,
  buildIssueBody,
  buildIssueTitle,
  computeFingerprint,
  validateBugReport,
  type BugReportResult
} from '../../../src/shared/bugReport'

// Minimal binding types so no extra dependency (@cloudflare/workers-types) is needed.
export interface KVLike {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}
export interface R2Like {
  put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
}
export interface Env {
  /** Secret. Fine-grained PAT, repository "Issues: Read and write" only. `wrangler secret put GITHUB_TOKEN` */
  GITHUB_TOKEN: string
  /** `owner/name`, e.g. javadag/dota2-skinforge */
  GITHUB_REPO: string
  /** KV namespace for rate-limit counters and duplicate fingerprints. */
  STATE: KVLike
  /** Optional: R2 bucket for screenshots. Without it (or SCREENSHOT_PUBLIC_URL) screenshots are dropped. */
  SCREENSHOTS?: R2Like
  /** Public base URL serving the SCREENSHOTS bucket, no trailing slash. */
  SCREENSHOT_PUBLIC_URL?: string
}

export interface Deps {
  fetchImpl?: typeof fetch
  now?: () => number
}

export const LIMITS = {
  maxBodyBytes: 4.5 * 1024 * 1024,
  perIpPerHour: 5,
  perInstallPerDay: 10,
  duplicateTtlSeconds: 30 * 24 * 60 * 60
}

function json(body: BugReportResult, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}

/**
 * Best-effort fixed-window counter. KV is not atomic, so concurrent bursts can slightly overshoot;
 * add a Cloudflare Rate Limiting rule on the route if you need a hard cap.
 */
async function overLimit(kv: KVLike, key: string, max: number, ttlSeconds: number): Promise<boolean> {
  const current = Number((await kv.get(key)) ?? '0')
  if (current >= max) return true
  await kv.put(key, String(current + 1), { expirationTtl: ttlSeconds })
  return false
}

function imageExtension(bytes: Uint8Array, mime: string): string | null {
  const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b)
  if (mime === 'image/png' && startsWith(0x89, 0x50, 0x4e, 0x47)) return 'png'
  if (mime === 'image/jpeg' && startsWith(0xff, 0xd8, 0xff)) return 'jpg'
  if (
    mime === 'image/webp' &&
    startsWith(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return 'webp'
  return null
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

interface Stored {
  url: string
  number: number
}

export async function handleRequest(request: Request, env: Env, deps: Deps = {}): Promise<Response> {
  const doFetch = deps.fetchImpl ?? fetch
  const now = (deps.now ?? Date.now)()

  if (request.method !== 'POST') return json({ ok: false, code: 'invalid', error: 'Method not allowed.' }, 405)
  if (!(request.headers.get('Content-Type') ?? '').includes('application/json')) {
    return json({ ok: false, code: 'invalid', error: 'Expected application/json.' }, 415)
  }
  const declared = Number(request.headers.get('Content-Length') ?? '0')
  if (declared > LIMITS.maxBodyBytes) return json({ ok: false, code: 'invalid', error: 'Report is too large.' }, 413)

  const raw = await request.text()
  if (raw.length > LIMITS.maxBodyBytes) return json({ ok: false, code: 'invalid', error: 'Report is too large.' }, 413)

  let input: unknown
  try {
    input = JSON.parse(raw)
  } catch {
    return json({ ok: false, code: 'invalid', error: 'Malformed JSON.' }, 400)
  }

  // Cheap checks first: the install id is validated again below, but the limiter needs a safe key.
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const rawInstall = String((input as { installId?: unknown } | null)?.installId ?? '').slice(0, 64)
  const installKey = /^[A-Za-z0-9-]{8,64}$/.test(rawInstall) ? rawInstall : 'invalid'
  const hourBucket = Math.floor(now / 3_600_000)
  const dayBucket = Math.floor(now / 86_400_000)
  if (
    (await overLimit(env.STATE, `rl:ip:${ip}:${hourBucket}`, LIMITS.perIpPerHour, 3_700)) ||
    (await overLimit(env.STATE, `rl:id:${installKey}:${dayBucket}`, LIMITS.perInstallPerDay, 90_000))
  ) {
    return json({ ok: false, code: 'rate_limited', error: 'Too many reports. Please try again later.' }, 429)
  }

  const validated = validateBugReport(input)
  if (!validated.ok) return json({ ok: false, code: 'invalid', error: validated.error }, 400)
  const report = validated.value

  const fingerprint = await computeFingerprint(report.title, report.description)
  const known = await env.STATE.get(`fp:${fingerprint}`)
  if (known) {
    const existing = JSON.parse(known) as Stored
    return json({ ok: true, duplicate: true, issueUrl: existing.url, issueNumber: existing.number })
  }

  let screenshotUrl: string | undefined
  if (report.screenshot && env.SCREENSHOTS && env.SCREENSHOT_PUBLIC_URL) {
    const bytes = base64ToBytes(report.screenshot.dataBase64)
    const ext = imageExtension(bytes, report.screenshot.mime)
    if (!ext) return json({ ok: false, code: 'invalid', error: 'Screenshot is not a valid image.' }, 400)
    const key = `bug-reports/${fingerprint}-${now}.${ext}`
    await env.SCREENSHOTS.put(key, bytes, { httpMetadata: { contentType: report.screenshot.mime } })
    screenshotUrl = `${env.SCREENSHOT_PUBLIC_URL}/${key}`
  }

  const res = await doFetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'skinforge-bug-relay',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: buildIssueTitle(report.title),
      body: buildIssueBody(report, screenshotUrl),
      labels: [...BUG_REPORT_LABELS]
    })
  })

  if (!res.ok) {
    // Log status only; never echo GitHub's response body or any credential to the client.
    console.error(`GitHub issue creation failed: ${res.status}`)
    return json({ ok: false, code: 'server', error: 'Could not create the issue right now.' }, 502)
  }

  const issue = (await res.json()) as { html_url: string; number: number }
  await env.STATE.put(`fp:${fingerprint}`, JSON.stringify({ url: issue.html_url, number: issue.number } satisfies Stored), {
    expirationTtl: LIMITS.duplicateTtlSeconds
  })
  return json({ ok: true, issueUrl: issue.html_url, issueNumber: issue.number }, 201)
}

export default {
  fetch: (request: Request, env: Env) => handleRequest(request, env)
}
