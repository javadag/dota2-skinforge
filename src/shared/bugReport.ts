/**
 * Bug-report contract shared by the Electron app (main + renderer) and the Cloudflare Worker.
 *
 * Pure functions only (no Node / DOM / Electron imports) so the same validation, redaction and
 * issue formatting runs on both sides. The Worker re-validates everything: the client is never trusted.
 */

export const BUG_REPORT_LIMITS = {
  titleMin: 5,
  titleMax: 120,
  descriptionMin: 10,
  descriptionMax: 4000,
  stepsMax: 3000,
  logsMaxLines: 200,
  logsMaxChars: 20000,
  errorsMaxChars: 8000,
  screenshotMaxBytes: 3 * 1024 * 1024,
  diagnosticValueMax: 200
} as const

export const BUG_REPORT_LABELS = ['bug', 'user-reported'] as const

export type ScreenshotMime = 'image/png' | 'image/jpeg' | 'image/webp'

export interface BugReportDiagnostics {
  appName: string
  appVersion: string
  packaged: boolean
  platform: string
  osRelease: string
  arch: string
  electron: string
  chrome: string
  node: string
  locale: string
  totalMemoryMB: number
  activeTab?: string
  dotaFound?: boolean
  modsInstalled?: boolean
}

export interface BugReportScreenshot {
  mime: ScreenshotMime
  /** Base64 without a data-URL prefix. */
  dataBase64: string
}

export interface BugReportPayload {
  title: string
  description: string
  steps: string
  diagnostics: BugReportDiagnostics
  logs: string
  errors: string
  installId: string
  screenshot?: BugReportScreenshot
}

export interface BugReportResult {
  ok: boolean
  issueUrl?: string
  issueNumber?: number
  /** True when an identical report already exists; no new issue was created. */
  duplicate?: boolean
  error?: string
  code?: 'not_configured' | 'invalid' | 'cooldown' | 'rate_limited' | 'network' | 'server'
}

export type ValidationResult = { ok: true; value: BugReportPayload } | { ok: false; error: string }

/** Strip data that identifies the user or grants access, before anything leaves the machine. */
export function redactSensitive(text: string): string {
  return text
    .replace(/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/g, '<token>')
    .replace(/\b(Bearer|token|apikey|api_key|secret|password)(\s*[:=]\s*|\s+)[A-Za-z0-9._~+/=-]{12,}/gi, '$1$2<redacted>')
    .replace(/([A-Za-z]:\\Users\\)[^\\/\s"'<>|:*?]+/gi, '$1<user>')
    .replace(/\/(Users|home)\/[^/\s"'<>]+/g, '/$1/<user>')
    .replace(/\b7656119\d{10}\b/g, '<steamid>')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>')
}

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

function cleanText(value: unknown, max: number): string {
  // Drop control characters except tab/newline, normalise newlines, then redact.
  return redactSensitive(
    clip(value, max)
      .replace(/\r\n?/g, '\n')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  ).trim()
}

function cleanDiagnostics(raw: unknown): BugReportDiagnostics {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const s = (k: string) => cleanText(d[k], BUG_REPORT_LIMITS.diagnosticValueMax).replace(/\n/g, ' ') || 'unknown'
  const out: BugReportDiagnostics = {
    appName: s('appName'),
    appVersion: s('appVersion'),
    packaged: d.packaged === true,
    platform: s('platform'),
    osRelease: s('osRelease'),
    arch: s('arch'),
    electron: s('electron'),
    chrome: s('chrome'),
    node: s('node'),
    locale: s('locale'),
    totalMemoryMB: Number.isFinite(d.totalMemoryMB) ? Math.max(0, Math.round(d.totalMemoryMB as number)) : 0
  }
  if (typeof d.activeTab === 'string') out.activeTab = s('activeTab')
  if (typeof d.dotaFound === 'boolean') out.dotaFound = d.dotaFound
  if (typeof d.modsInstalled === 'boolean') out.modsInstalled = d.modsInstalled
  return out
}

/** Validate and sanitise an untrusted payload. Used by the client before sending and by the Worker on receipt. */
export function validateBugReport(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Invalid report.' }
  const raw = input as Record<string, unknown>
  const L = BUG_REPORT_LIMITS

  const title = cleanText(raw.title, L.titleMax).replace(/\n+/g, ' ')
  if (title.length < L.titleMin) return { ok: false, error: `Title must be at least ${L.titleMin} characters.` }

  const description = cleanText(raw.description, L.descriptionMax)
  if (description.length < L.descriptionMin) {
    return { ok: false, error: `Please describe the problem (at least ${L.descriptionMin} characters).` }
  }

  const installId = clip(raw.installId, 64)
  if (!/^[A-Za-z0-9-]{8,64}$/.test(installId)) return { ok: false, error: 'Invalid installation id.' }

  const logLines = cleanText(raw.logs, L.logsMaxChars).split('\n').slice(-L.logsMaxLines).join('\n')

  let screenshot: BugReportScreenshot | undefined
  if (raw.screenshot !== undefined && raw.screenshot !== null) {
    const s = raw.screenshot as Record<string, unknown>
    const mime = s.mime
    const data = typeof s.dataBase64 === 'string' ? s.dataBase64 : ''
    if (mime !== 'image/png' && mime !== 'image/jpeg' && mime !== 'image/webp') {
      return { ok: false, error: 'Unsupported screenshot format.' }
    }
    if (!/^[A-Za-z0-9+/]+=*$/.test(data) || Math.floor((data.length * 3) / 4) > L.screenshotMaxBytes) {
      return { ok: false, error: 'Screenshot is invalid or too large.' }
    }
    screenshot = { mime, dataBase64: data }
  }

  return {
    ok: true,
    value: {
      title,
      description,
      steps: cleanText(raw.steps, L.stepsMax),
      diagnostics: cleanDiagnostics(raw.diagnostics),
      logs: logLines,
      errors: cleanText(raw.errors, L.errorsMaxChars),
      installId,
      screenshot
    }
  }
}

/** Stable hash of the report's identity, used for duplicate detection (client cache + Worker KV). */
export async function computeFingerprint(title: string, description: string): Promise<string> {
  const normalise = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  const text = `${normalise(title)}|${normalise(description).slice(0, 500)}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

/** Defuse @mentions and cross-references so a report cannot ping users or link other issues. */
function defuse(text: string): string {
  return text.replace(/@(?=[A-Za-z0-9])/g, '@\u200b').replace(/(^|[\s(])#(?=\d)/g, '$1#\u200b')
}

/** Fence long enough that the content can never close it early. */
function fenced(content: string, lang = ''): string {
  const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map((m) => m.length))
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}${lang}\n${content}\n${fence}`
}

export function buildIssueTitle(title: string): string {
  return `[Bug] ${defuse(title)}`.slice(0, 140)
}

export function buildIssueBody(payload: BugReportPayload, screenshotUrl?: string): string {
  const d = payload.diagnostics
  const section = (heading: string, body: string) => `### ${heading}\n\n${body}\n`
  const parts: string[] = [
    section('Description', defuse(payload.description)),
    section('Steps to reproduce', payload.steps ? defuse(payload.steps) : '_Not provided._')
  ]

  parts.push(
    section(
      'Environment',
      [
        `| | |`,
        `|---|---|`,
        `| App | ${d.appName} ${d.appVersion}${d.packaged ? '' : ' (dev build)'} |`,
        `| OS | ${d.platform} ${d.osRelease} (${d.arch}) |`,
        `| Electron / Chrome / Node | ${d.electron} / ${d.chrome} / ${d.node} |`,
        `| Locale | ${d.locale} |`,
        `| Memory | ${d.totalMemoryMB} MB |`,
        d.activeTab ? `| Active tab | ${d.activeTab} |` : '',
        d.dotaFound !== undefined ? `| Dota 2 found | ${d.dotaFound ? 'yes' : 'no'} |` : '',
        d.modsInstalled !== undefined ? `| Mods installed | ${d.modsInstalled ? 'yes' : 'no'} |` : ''
      ]
        .filter(Boolean)
        .join('\n')
    )
  )

  if (screenshotUrl) parts.push(section('Screenshot', `![screenshot](${screenshotUrl})`))
  if (payload.errors) parts.push(section('Error details', fenced(payload.errors)))
  if (payload.logs) {
    parts.push(`<details>\n<summary>Recent app logs</summary>\n\n${fenced(payload.logs)}\n\n</details>\n`)
  }
  parts.push('---\n_Submitted from the in-app bug reporter._')
  return parts.join('\n')
}
