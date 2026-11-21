/**
 * Bug Report Service (main process)
 *
 * Builds a sanitised report and sends it to the bug-report relay (a Cloudflare Worker, see
 * `workers/bug-report`). The app NEVER holds a GitHub credential: the relay owns the token and
 * creates the issue. This module also applies cheap local guards (cooldown + duplicate memory)
 * so honest users do not hit server-side limits.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'
import {
  BUG_REPORT_LIMITS,
  computeFingerprint,
  redactSensitive,
  validateBugReport,
  validateBugReportComment,
  type BugReportComment,
  type BugReportDiagnostics,
  type BugReportIssueStatus,
  type BugReportResult
} from '../../../shared/utils/bugReport'

export const SUBMIT_COOLDOWN_MS = 60_000
export const LOCAL_DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 20_000
const MAX_ERROR_ENTRIES = 50
const MAX_REMEMBERED_REPORTS = 30
const MAX_SCREENSHOT_WIDTH = 1600

export interface ResizableImageLike {
  isEmpty(): boolean
  getSize(): { width: number; height: number }
  resize(options: { width: number; quality: 'best' }): ResizableImageLike
  toPNG(): Buffer
  toJPEG(quality: number): Buffer
}

export interface EncodedBugScreenshot {
  mime: 'image/png' | 'image/jpeg'
  dataBase64: string
  sizeBytes: number
}

/** Downscale and encode below the size limit. Re-encoding also strips EXIF/location metadata. */
export function encodeBugScreenshot(image: ResizableImageLike): EncodedBugScreenshot | null {
  if (image.isEmpty()) return null
  let img = image
  if (img.getSize().width > MAX_SCREENSHOT_WIDTH) {
    img = img.resize({ width: MAX_SCREENSHOT_WIDTH, quality: 'best' })
  }

  const png = img.toPNG()
  if (png.length <= BUG_REPORT_LIMITS.screenshotMaxBytes) {
    return { mime: 'image/png', dataBase64: png.toString('base64'), sizeBytes: png.length }
  }
  for (const quality of [85, 70, 50]) {
    const jpg = img.toJPEG(quality)
    if (jpg.length <= BUG_REPORT_LIMITS.screenshotMaxBytes) {
      return { mime: 'image/jpeg', dataBase64: jpg.toString('base64'), sizeBytes: jpg.length }
    }
  }
  return null
}

interface SentReport {
  fingerprint: string
  at: number
  title?: string
  issueNumber?: number
  issueUrl?: string
}

interface BugReportState {
  installId: string
  lastSubmitAt: number
  sent: SentReport[]
}

// ---------------------------------------------------------------------------------------------
// Main-process error capture (ring buffer). Included in reports as "error details".
// ---------------------------------------------------------------------------------------------

const errorBuffer: string[] = []
let captureInstalled = false

function pushError(kind: string, detail: unknown): void {
  const text =
    detail instanceof Error
      ? `${detail.name}: ${detail.message}\n${detail.stack ?? ''}`
      : typeof detail === 'string'
        ? detail
        : safeStringify(detail)
  errorBuffer.push(`[${new Date().toISOString()}] ${kind}: ${text}`)
  if (errorBuffer.length > MAX_ERROR_ENTRIES) errorBuffer.shift()
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** Hook console.error/warn and process-level failures. Safe to call more than once. */
export function installMainErrorCapture(): void {
  if (captureInstalled) return
  captureInstalled = true
  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      pushError(`console.${level}`, args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack ?? ''}` : safeStringify(a))).join(' '))
      original(...args)
    }
  }
  process.on('uncaughtExceptionMonitor', (err) => pushError('uncaughtException', err))
  process.on('unhandledRejection', (reason) => pushError('unhandledRejection', reason))
}

export function getCapturedErrors(): string {
  return errorBuffer.join('\n')
}

// ---------------------------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------------------------

export interface DiagnosticsInput {
  appName: string
  appVersion: string
  packaged: boolean
  locale: string
  activeTab?: string
  dotaFound?: boolean
  modsInstalled?: boolean
}

export function collectDiagnostics(input: DiagnosticsInput): BugReportDiagnostics {
  return {
    appName: input.appName,
    appVersion: input.appVersion,
    packaged: input.packaged,
    platform: os.platform(),
    osRelease: os.release(),
    arch: os.arch(),
    electron: process.versions.electron ?? 'n/a',
    chrome: process.versions.chrome ?? 'n/a',
    node: process.versions.node,
    locale: input.locale,
    totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
    activeTab: input.activeTab,
    dotaFound: input.dotaFound,
    modsInstalled: input.modsInstalled
  }
}

// ---------------------------------------------------------------------------------------------
// Local state (install id, cooldown, duplicate memory)
// ---------------------------------------------------------------------------------------------

function readState(file: string): BugReportState {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<BugReportState>
    return {
      installId: typeof parsed.installId === 'string' && parsed.installId ? parsed.installId : randomUUID(),
      lastSubmitAt: typeof parsed.lastSubmitAt === 'number' ? parsed.lastSubmitAt : 0,
      sent: Array.isArray(parsed.sent) ? parsed.sent.filter((s): s is SentReport => !!s && typeof s.fingerprint === 'string') : []
    }
  } catch {
    return { installId: randomUUID(), lastSubmitAt: 0, sent: [] }
  }
}

function writeState(file: string, state: BugReportState): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf-8')
  } catch {
    // Losing local state only weakens client-side guards; the relay still enforces limits.
  }
}

export function getInstallId(stateFile: string): string {
  const state = readState(stateFile)
  if (!fs.existsSync(stateFile)) writeState(stateFile, state)
  return state.installId
}

// ---------------------------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------------------------

export interface SubmitInput {
  title: string
  description: string
  steps?: string
  logs?: string
  includeLogs: boolean
  diagnostics: BugReportDiagnostics
  screenshot?: { mime: string; dataBase64: string }
}

export interface SubmitOptions {
  endpoint: string
  stateFile: string
  fetchImpl?: typeof fetch
  now?: () => number
}

export async function submitBugReport(input: SubmitInput, options: SubmitOptions): Promise<BugReportResult> {
  const now = (options.now ?? Date.now)()
  const doFetch = options.fetchImpl ?? fetch

  if (!options.endpoint) {
    return { ok: false, code: 'not_configured', error: 'Bug reporting is not configured in this build.' }
  }

  const state = readState(options.stateFile)

  const validated = validateBugReport({
    title: input.title,
    description: input.description,
    steps: input.steps ?? '',
    diagnostics: input.diagnostics,
    logs: input.includeLogs ? (input.logs ?? '') : '',
    errors: input.includeLogs ? getCapturedErrors() : '',
    installId: state.installId,
    screenshot: input.screenshot
  })
  if (!validated.ok) return { ok: false, code: 'invalid', error: validated.error }
  const payload = validated.value

  const fingerprint = await computeFingerprint(payload.title, payload.description)

  const previous = state.sent.find((s) => s.fingerprint === fingerprint && now - s.at < LOCAL_DUPLICATE_WINDOW_MS)
  if (previous) {
    return {
      ok: true,
      duplicate: true,
      issueUrl: previous.issueUrl,
      issueNumber: previous.issueNumber,
      error: 'You already sent this report. Thanks, we have it.'
    }
  }

  const wait = SUBMIT_COOLDOWN_MS - (now - state.lastSubmitAt)
  if (wait > 0) {
    return { ok: false, code: 'cooldown', error: `Please wait ${Math.ceil(wait / 1000)}s before sending another report.` }
  }

  let response: Response
  try {
    response = await doFetch(options.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return {
      ok: false,
      code: 'network',
      error: timedOut
        ? 'The bug report server did not respond in time. Please try again.'
        : 'Could not reach the bug report server. Check your connection and try again.'
    }
  }

  let body: Partial<BugReportResult> = {}
  try {
    body = (await response.json()) as Partial<BugReportResult>
  } catch {
    // Non-JSON body; fall through to status handling.
  }

  if (response.status === 429) {
    return { ok: false, code: 'rate_limited', error: 'Too many reports from this connection. Please try again later.' }
  }
  if (response.status >= 400 && response.status < 500) {
    return { ok: false, code: 'invalid', error: redactSensitive(body.error ?? 'The report was rejected by the server.') }
  }
  if (!response.ok || !body.ok) {
    return { ok: false, code: 'server', error: 'The bug report server had a problem. Please try again later.' }
  }

  state.lastSubmitAt = now
  const entry: SentReport = {
    fingerprint,
    at: now,
    title: payload.title,
    issueNumber: body.issueNumber,
    issueUrl: body.issueUrl
  }
  const rest = body.issueNumber ? state.sent.filter((s) => s.issueNumber !== body.issueNumber) : state.sent
  state.sent = [entry, ...rest].slice(0, MAX_REMEMBERED_REPORTS)
  writeState(options.stateFile, state)

  return { ok: true, issueUrl: body.issueUrl, issueNumber: body.issueNumber, duplicate: body.duplicate === true }
}

// ---------------------------------------------------------------------------------------------
// Track & follow up on previously submitted reports
// ---------------------------------------------------------------------------------------------

export interface TrackedBugReport {
  issueNumber: number
  issueUrl: string
  title: string
  submittedAt: number
  state: 'open' | 'closed' | 'unknown'
  stateReason?: string | null
  labels: string[]
  updatedAt?: string
  comments: BugReportComment[]
}

export interface ListBugReportsResult {
  ok: boolean
  reports: TrackedBugReport[]
  offline?: boolean
  error?: string
}

export interface CommentInput {
  issueNumber: number
  message: string
  screenshot?: { mime: string; dataBase64: string }
}

export interface CommentResult {
  ok: boolean
  comment?: BugReportComment
  error?: string
}

function resolveIssueNumber(entry: SentReport): number | null {
  if (typeof entry.issueNumber === 'number' && entry.issueNumber > 0) return entry.issueNumber
  const match = entry.issueUrl?.match(/\/issues\/(\d+)$/)
  return match ? Number(match[1]) : null
}

function baseEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/, '')
}

export async function listBugReports(options: {
  endpoint: string
  stateFile: string
  fetchImpl?: typeof fetch
}): Promise<ListBugReportsResult> {
  const state = readState(options.stateFile)
  const local = state.sent
    .map((entry) => {
      const num = resolveIssueNumber(entry)
      if (!num || !entry.issueUrl) return null
      return { entry, num }
    })
    .filter((item): item is { entry: SentReport; num: number } => item !== null)
    .slice(0, 20)

  if (local.length === 0) return { ok: true, reports: [] }

  const fallback = (): TrackedBugReport[] =>
    local.map(({ entry, num }) => ({
      issueNumber: num,
      issueUrl: entry.issueUrl!,
      title: entry.title ?? `Issue #${num}`,
      submittedAt: entry.at,
      state: 'unknown',
      labels: [],
      comments: []
    }))

  if (!options.endpoint) {
    return { ok: true, reports: fallback(), offline: true }
  }

  const doFetch = options.fetchImpl ?? fetch
  const numbers = local.map((l) => l.num).join(',')
  try {
    const res = await doFetch(`${baseEndpoint(options.endpoint)}/issues?numbers=${numbers}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    if (!res.ok) return { ok: true, reports: fallback(), offline: true }
    const data = (await res.json()) as { ok?: boolean; issues?: BugReportIssueStatus[] }
    const byNum = new Map<number, BugReportIssueStatus>((data.issues ?? []).map((i) => [i.issueNumber, i]))

    const reports: TrackedBugReport[] = local.map(({ entry, num }) => {
      const live = byNum.get(num)
      if (!live) {
        return {
          issueNumber: num,
          issueUrl: entry.issueUrl!,
          title: entry.title ?? `Issue #${num}`,
          submittedAt: entry.at,
          state: 'unknown',
          labels: [],
          comments: []
        }
      }
      return {
        issueNumber: live.issueNumber,
        issueUrl: live.issueUrl,
        title: live.title,
        submittedAt: entry.at,
        state: live.state,
        stateReason: live.stateReason,
        labels: live.labels,
        updatedAt: live.updatedAt,
        comments: live.comments
      }
    })
    return { ok: true, reports }
  } catch {
    return { ok: true, reports: fallback(), offline: true }
  }
}

export async function commentOnBugReport(
  input: CommentInput,
  options: { endpoint: string; stateFile: string; fetchImpl?: typeof fetch }
): Promise<CommentResult> {
  if (!options.endpoint) {
    return { ok: false, error: 'Bug reporting is not configured in this build.' }
  }
  if (!Number.isInteger(input.issueNumber) || input.issueNumber <= 0) {
    return { ok: false, error: 'Invalid issue number.' }
  }

  const state = readState(options.stateFile)
  const validated = validateBugReportComment({
    message: input.message,
    installId: state.installId,
    screenshot: input.screenshot
  })
  if (!validated.ok) return { ok: false, error: validated.error }

  const doFetch = options.fetchImpl ?? fetch
  let res: Response
  try {
    res = await doFetch(`${baseEndpoint(options.endpoint)}/issues/${input.issueNumber}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(validated.value),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return {
      ok: false,
      error: timedOut
        ? 'The bug report server did not respond in time. Please try again.'
        : 'Could not reach the bug report server. Check your connection and try again.'
    }
  }

  let body: { ok?: boolean; comment?: BugReportComment; error?: string } = {}
  try {
    body = (await res.json()) as { ok?: boolean; comment?: BugReportComment; error?: string }
  } catch {
    // Non-JSON response
  }

  if (res.status === 429) {
    return { ok: false, error: 'Too many updates from this connection. Please try again later.' }
  }
  if (!res.ok || !body.ok || !body.comment) {
    return { ok: false, error: redactSensitive(body.error ?? 'Could not post your update right now.') }
  }
  return { ok: true, comment: body.comment }
}
