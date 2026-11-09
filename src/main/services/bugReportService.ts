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
  computeFingerprint,
  redactSensitive,
  validateBugReport,
  type BugReportDiagnostics,
  type BugReportResult
} from '../../shared/bugReport'

export const SUBMIT_COOLDOWN_MS = 60_000
export const LOCAL_DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 20_000
const MAX_ERROR_ENTRIES = 50
const MAX_REMEMBERED_REPORTS = 30

interface SentReport {
  fingerprint: string
  at: number
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

export function resetCapturedErrorsForTests(): void {
  errorBuffer.length = 0
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
  state.sent = [{ fingerprint, at: now, issueUrl: body.issueUrl }, ...state.sent].slice(0, MAX_REMEMBERED_REPORTS)
  writeState(options.stateFile, state)

  return { ok: true, issueUrl: body.issueUrl, issueNumber: body.issueNumber, duplicate: body.duplicate === true }
}
