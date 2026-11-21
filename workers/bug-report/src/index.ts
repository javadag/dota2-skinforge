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
  IN_APP_FOLLOWUP_FOOTER,
  INSTALL_ID_REGEX,
  buildCommentBody,
  buildIssueBody,
  buildIssueTitle,
  computeFingerprint,
  validateBugReport,
  validateBugReportComment,
  type BugReportComment,
  type BugReportIssueStatus
} from '../../../src/shared/utils/bugReport'

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
  duplicateTtlSeconds: 30 * 24 * 60 * 60,
  issueCacheTtlSeconds: 300,
  maxIssuesPerQuery: 20,
  maxCommentsPerIssue: 30
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'skinforge-bug-relay',
    'Content-Type': 'application/json'
  }
}

async function hashInstallId(installId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(installId))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

async function addIssueOwner(kv: KVLike, issueNumber: number, installId: string): Promise<void> {
  const hash = await hashInstallId(installId)
  const key = `owner:${issueNumber}`
  const existingRaw = await kv.get(key)
  let owners: string[] = []
  if (existingRaw) {
    try {
      const parsed = JSON.parse(existingRaw)
      if (Array.isArray(parsed)) owners = parsed.filter((v): v is string => typeof v === 'string')
    } catch {
      // Ignore malformed owner list
    }
  }
  if (!owners.includes(hash)) {
    owners.push(hash)
    await kv.put(key, JSON.stringify(owners))
  }
}

async function isIssueOwner(kv: KVLike, issueNumber: number, installId: string): Promise<boolean> {
  const raw = await kv.get(`owner:${issueNumber}`)
  if (!raw) return false
  try {
    const owners = JSON.parse(raw)
    if (!Array.isArray(owners)) return false
    const hash = await hashInstallId(installId)
    return owners.includes(hash)
  } catch {
    return false
  }
}

/**
 * Best-effort fixed-window counter. Increments the key when below `max`; returns `true` when the
 * caller has already exhausted its quota for the window.
 */
async function consumeRateLimitQuota(kv: KVLike, key: string, max: number, ttlSeconds: number): Promise<boolean> {
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

function base64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

interface Stored {
  url: string
  number: number
}

interface GitHubIssueApi {
  number: number
  html_url: string
  title: string
  state: 'open' | 'closed'
  state_reason?: string | null
  labels?: Array<{ name?: string }>
  updated_at: string
}

interface GitHubCommentApi {
  id: number
  user?: { login?: string } | null
  body?: string | null
  created_at: string
}

function stripFollowupFooter(body: string): { text: string; fromReporter: boolean } {
  const idx = body.lastIndexOf(IN_APP_FOLLOWUP_FOOTER)
  if (idx === -1) return { text: body.trim(), fromReporter: false }
  const cleaned = body
    .slice(0, idx)
    .replace(/\n*---\s*$/, '')
    .trim()
  return { text: cleaned, fromReporter: true }
}

async function fetchIssueStatus(issueNumber: number, env: Env, doFetch: typeof fetch): Promise<BugReportIssueStatus | null> {
  const cacheKey = `cache:issue:${issueNumber}`
  const cached = await env.STATE.get(cacheKey)
  if (cached) {
    try {
      return JSON.parse(cached) as BugReportIssueStatus
    } catch {
      // Cache corrupt; fall through to fetch
    }
  }

  const headers = githubHeaders(env.GITHUB_TOKEN)
  const issueRes = await doFetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues/${issueNumber}`, { headers })
  if (!issueRes.ok) return null
  const issue = (await issueRes.json()) as GitHubIssueApi

  let comments: BugReportComment[] = []
  const commentsRes = await doFetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/issues/${issueNumber}/comments?per_page=${LIMITS.maxCommentsPerIssue}`,
    { headers }
  )
  if (commentsRes.ok) {
    const rawComments = (await commentsRes.json()) as GitHubCommentApi[]
    comments = rawComments.map((c) => {
      const parsed = stripFollowupFooter(c.body ?? '')
      return {
        id: c.id,
        author: parsed.fromReporter ? 'You' : (c.user?.login ?? 'Maintainer'),
        fromReporter: parsed.fromReporter,
        body: parsed.text,
        createdAt: c.created_at
      }
    })
  }

  const status: BugReportIssueStatus = {
    issueNumber: issue.number,
    issueUrl: issue.html_url,
    title: issue.title,
    state: issue.state === 'closed' ? 'closed' : 'open',
    stateReason: issue.state_reason ?? null,
    labels: (issue.labels ?? []).map((l) => l.name ?? '').filter(Boolean),
    updatedAt: issue.updated_at,
    comments
  }

  await env.STATE.put(cacheKey, JSON.stringify(status), { expirationTtl: LIMITS.issueCacheTtlSeconds })
  return status
}

async function handleGetIssues(url: URL, env: Env, doFetch: typeof fetch): Promise<Response> {
  const rawNumbers = (url.searchParams.get('numbers') ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
  const unique = Array.from(new Set(rawNumbers)).slice(0, LIMITS.maxIssuesPerQuery)
  if (unique.length === 0) return json({ ok: true, issues: [] })

  const results = await Promise.all(unique.map((n) => fetchIssueStatus(n, env, doFetch)))
  const issues = results.filter((item): item is BugReportIssueStatus => item !== null)
  return json({ ok: true, issues })
}

async function handlePostComment(request: Request, issueNumber: number, env: Env, doFetch: typeof fetch, now: number): Promise<Response> {
  if (!(request.headers.get('Content-Type') ?? '').includes('application/json')) {
    return json({ ok: false, code: 'invalid', error: 'Expected application/json.' }, 415)
  }
  const declared = Number(request.headers.get('Content-Length') ?? '0')
  if (declared > LIMITS.maxBodyBytes) return json({ ok: false, code: 'invalid', error: 'Update is too large.' }, 413)

  const raw = await request.text()
  if (raw.length > LIMITS.maxBodyBytes) return json({ ok: false, code: 'invalid', error: 'Update is too large.' }, 413)

  let input: unknown
  try {
    input = JSON.parse(raw)
  } catch {
    return json({ ok: false, code: 'invalid', error: 'Malformed JSON.' }, 400)
  }

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const rawInstall = String((input as { installId?: unknown } | null)?.installId ?? '').slice(0, 64)
  const installKey = INSTALL_ID_REGEX.test(rawInstall) ? rawInstall : 'invalid'
  const hourBucket = Math.floor(now / 3_600_000)
  const dayBucket = Math.floor(now / 86_400_000)
  if (
    (await consumeRateLimitQuota(env.STATE, `rl:comment:ip:${ip}:${hourBucket}`, LIMITS.perIpPerHour * 2, 3_700)) ||
    (await consumeRateLimitQuota(env.STATE, `rl:comment:id:${installKey}:${dayBucket}`, LIMITS.perInstallPerDay * 2, 90_000))
  ) {
    return json({ ok: false, code: 'rate_limited', error: 'Too many updates. Please try again later.' }, 429)
  }

  const validated = validateBugReportComment(input)
  if (!validated.ok) return json({ ok: false, code: 'invalid', error: validated.error }, 400)
  const comment = validated.value

  const allowed = await isIssueOwner(env.STATE, issueNumber, comment.installId)
  if (!allowed) {
    return json({ ok: false, code: 'invalid', error: 'Only the original reporter can add an update from the app.' }, 403)
  }

  let screenshotUrl: string | undefined
  if (comment.screenshot && env.SCREENSHOTS && env.SCREENSHOT_PUBLIC_URL) {
    const bytes = base64ToBytes(comment.screenshot.dataBase64)
    const ext = bytes ? imageExtension(bytes, comment.screenshot.mime) : null
    if (!bytes || !ext) return json({ ok: false, code: 'invalid', error: 'Screenshot is not a valid image.' }, 400)
    const key = `bug-reports/comment-${issueNumber}-${now}.${ext}`
    await env.SCREENSHOTS.put(key, bytes, { httpMetadata: { contentType: comment.screenshot.mime } })
    screenshotUrl = `${env.SCREENSHOT_PUBLIC_URL}/${key}`
  }

  const res = await doFetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues/${issueNumber}/comments`, {
    method: 'POST',
    headers: githubHeaders(env.GITHUB_TOKEN),
    body: JSON.stringify({ body: buildCommentBody(comment.message, screenshotUrl) })
  })

  if (!res.ok) {
    console.error(`GitHub comment creation failed: ${res.status}`)
    return json({ ok: false, code: 'server', error: 'Could not post your update right now.' }, 502)
  }

  const created = (await res.json()) as GitHubCommentApi
  const createdComment: BugReportComment = {
    id: created.id,
    author: 'You',
    fromReporter: true,
    body: comment.message,
    createdAt: created.created_at
  }

  // Update cached issue if present so the user sees their reply immediately.
  const cacheKey = `cache:issue:${issueNumber}`
  const cachedRaw = await env.STATE.get(cacheKey)
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw) as BugReportIssueStatus
      cached.comments = [...cached.comments, createdComment]
      cached.updatedAt = created.created_at
      await env.STATE.put(cacheKey, JSON.stringify(cached), { expirationTtl: LIMITS.issueCacheTtlSeconds })
    } catch {
      // Ignore cache update failure
    }
  }

  return json({ ok: true, comment: createdComment }, 201)
}

export async function handleRequest(request: Request, env: Env, deps: Deps = {}): Promise<Response> {
  const doFetch = deps.fetchImpl ?? fetch
  const now = (deps.now ?? Date.now)()
  const url = new URL(request.url)

  if (request.method === 'GET' && url.pathname === '/issues') {
    return handleGetIssues(url, env, doFetch)
  }

  const commentMatch = url.pathname.match(/^\/issues\/(\d+)\/comments$/)
  if (request.method === 'POST' && commentMatch) {
    return handlePostComment(request, Number(commentMatch[1]), env, doFetch, now)
  }

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
  const installKey = INSTALL_ID_REGEX.test(rawInstall) ? rawInstall : 'invalid'
  const hourBucket = Math.floor(now / 3_600_000)
  const dayBucket = Math.floor(now / 86_400_000)
  if (
    (await consumeRateLimitQuota(env.STATE, `rl:ip:${ip}:${hourBucket}`, LIMITS.perIpPerHour, 3_700)) ||
    (await consumeRateLimitQuota(env.STATE, `rl:id:${installKey}:${dayBucket}`, LIMITS.perInstallPerDay, 90_000))
  ) {
    return json({ ok: false, code: 'rate_limited', error: 'Too many reports. Please try again later.' }, 429)
  }

  const validated = validateBugReport(input)
  if (!validated.ok) return json({ ok: false, code: 'invalid', error: validated.error }, 400)
  const report = validated.value

  const fingerprint = await computeFingerprint(report.title, report.description)
  const known = await env.STATE.get(`fp:${fingerprint}`)
  if (known) {
    try {
      const existing = JSON.parse(known) as Stored
      if (existing && typeof existing.url === 'string' && typeof existing.number === 'number') {
        await addIssueOwner(env.STATE, existing.number, report.installId)
        return json({ ok: true, duplicate: true, issueUrl: existing.url, issueNumber: existing.number })
      }
    } catch {
      // Ignore corrupt fingerprint record and fall through to create a fresh issue.
    }
  }

  let screenshotUrl: string | undefined
  if (report.screenshot && env.SCREENSHOTS && env.SCREENSHOT_PUBLIC_URL) {
    const bytes = base64ToBytes(report.screenshot.dataBase64)
    const ext = bytes ? imageExtension(bytes, report.screenshot.mime) : null
    if (!bytes || !ext) return json({ ok: false, code: 'invalid', error: 'Screenshot is not a valid image.' }, 400)
    const key = `bug-reports/${fingerprint}-${now}.${ext}`
    await env.SCREENSHOTS.put(key, bytes, { httpMetadata: { contentType: report.screenshot.mime } })
    screenshotUrl = `${env.SCREENSHOT_PUBLIC_URL}/${key}`
  }

  const res = await doFetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
    method: 'POST',
    headers: githubHeaders(env.GITHUB_TOKEN),
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
  await addIssueOwner(env.STATE, issue.number, report.installId)
  return json({ ok: true, issueUrl: issue.html_url, issueNumber: issue.number }, 201)
}

export default {
  fetch: (request: Request, env: Env) => handleRequest(request, env)
}
