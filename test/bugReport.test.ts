import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildIssueBody,
  buildIssueTitle,
  computeFingerprint,
  redactSensitive,
  validateBugReport,
  BUG_REPORT_LIMITS
} from '../src/shared/bugReport'
import { submitBugReport, SUBMIT_COOLDOWN_MS, type SubmitInput } from '../src/main/services/bugReportService'
import { handleRequest, LIMITS, type Env, type KVLike } from '../workers/bug-report/src/index'

const diagnostics = {
  appName: 'Dota 2 SkinForge',
  appVersion: '1.3.2',
  packaged: true,
  platform: 'win32',
  osRelease: '10.0.22631',
  arch: 'x64',
  electron: '33.0.0',
  chrome: '130',
  node: '20',
  locale: 'en-US',
  totalMemoryMB: 16000
}

const validBody = (over: Record<string, unknown> = {}) => ({
  title: 'Install fails after selecting Arcana',
  description: 'The install button errors out right after I pick an arcana.',
  steps: '1. Open heroes\n2. Equip',
  diagnostics,
  logs: '[10:00] [error] boom',
  errors: '',
  installId: 'install-1234-abcd',
  ...over
})

class MemKV implements KVLike {
  store = new Map<string, string>()
  async get(k: string) {
    return this.store.get(k) ?? null
  }
  async put(k: string, v: string) {
    this.store.set(k, v)
  }
}

const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString('base64')

function workerRequest(body: unknown, ip = '1.1.1.1') {
  return new Request('https://relay.test/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify(body)
  })
}

function githubFetch(calls: { url: string; init: RequestInit }[], status = 201) {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ html_url: 'https://github.com/o/r/issues/7', number: 7 }), { status })
  }) as unknown as typeof fetch
}

test('redactSensitive removes user paths, tokens, emails and steam ids', () => {
  const out = redactSensitive(
    'C:\\Users\\Joad\\AppData\\x token ghp_abcdefghijklmnopqrstuvwxyz0123 mail a.b@c.io id 76561198012345678 /home/bob/file'
  )
  assert.ok(!out.includes('Joad'))
  assert.ok(!out.includes('ghp_'))
  assert.ok(!out.includes('a.b@c.io'))
  assert.ok(!out.includes('76561198012345678'))
  assert.ok(!out.includes('bob'))
  assert.ok(out.includes('C:\\Users\\<user>'))
})

test('validateBugReport enforces required fields and sanitises input', () => {
  assert.equal(validateBugReport(null).ok, false)
  assert.equal(validateBugReport(validBody({ title: 'abc' })).ok, false)
  assert.equal(validateBugReport(validBody({ description: 'short' })).ok, false)
  assert.equal(validateBugReport(validBody({ installId: '../../x' })).ok, false)
  assert.equal(validateBugReport(validBody({ screenshot: { mime: 'image/svg+xml', dataBase64: 'AAAA' } })).ok, false)

  const res = validateBugReport(validBody({ title: 'x'.repeat(500), logs: Array.from({ length: 500 }, (_, i) => `l${i}`).join('\n') }))
  assert.ok(res.ok)
  if (res.ok) {
    assert.equal(res.value.title.length, BUG_REPORT_LIMITS.titleMax)
    assert.equal(res.value.logs.split('\n').length, BUG_REPORT_LIMITS.logsMaxLines)
    assert.ok(res.value.logs.endsWith('l499'))
  }
})

test('fingerprint ignores case and punctuation but not content', async () => {
  const a = await computeFingerprint('Install FAILS!', 'It crashes, again.')
  const b = await computeFingerprint('install fails', 'it crashes again')
  const c = await computeFingerprint('install fails', 'different problem')
  assert.equal(a, b)
  assert.notEqual(a, c)
})

test('issue body defuses mentions and cannot be broken out of the log fence', () => {
  const v = validateBugReport(validBody({ description: 'ping @octocat see #12 now', logs: 'a\n```\n@evil' }))
  assert.ok(v.ok)
  if (!v.ok) return
  const body = buildIssueBody(v.value, 'https://img.example/x.png')
  assert.ok(!body.includes('@octocat'))
  assert.ok(!body.includes('#12'))
  assert.ok(body.includes('````\na\n```\n@evil\n````'))
  assert.ok(body.includes('![screenshot](https://img.example/x.png)'))
  assert.equal(buildIssueTitle('Hi @bob'), '[Bug] Hi @\u200bbob')
})

test('client: not configured, success, local duplicate, cooldown, errors', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugreport-'))
  const stateFile = path.join(dir, 'state.json')
  const input: SubmitInput = {
    title: 'Crash on install',
    description: 'Crashes when I click install.',
    includeLogs: true,
    logs: 'x',
    diagnostics
  }

  assert.equal((await submitBugReport(input, { endpoint: '', stateFile })).code, 'not_configured')

  let sent: Record<string, unknown> | null = null
  const ok = (async (_u: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body))
    return new Response(JSON.stringify({ ok: true, issueUrl: 'https://github.com/o/r/issues/1', issueNumber: 1 }), { status: 201 })
  }) as unknown as typeof fetch
  let t = 1_000_000
  const opts = { endpoint: 'https://relay.test', stateFile, fetchImpl: ok, now: () => t }

  const first = await submitBugReport(input, opts)
  assert.ok(first.ok && !first.duplicate && first.issueNumber === 1)
  assert.ok(sent && !('token' in sent))

  const again = await submitBugReport(input, opts)
  assert.ok(again.ok && again.duplicate && again.issueUrl)

  const other: SubmitInput = { ...input, title: 'Totally different bug', description: 'Something else happens here.' }
  t += 1000
  assert.equal((await submitBugReport(other, opts)).code, 'cooldown')

  t += SUBMIT_COOLDOWN_MS
  const limited = (async () => new Response('{}', { status: 429 })) as unknown as typeof fetch
  assert.equal((await submitBugReport(other, { ...opts, fetchImpl: limited })).code, 'rate_limited')
  const down = (async () => {
    throw new TypeError('fetch failed')
  }) as unknown as typeof fetch
  assert.equal((await submitBugReport(other, { ...opts, fetchImpl: down })).code, 'network')
  const broken = (async () => new Response('oops', { status: 500 })) as unknown as typeof fetch
  assert.equal((await submitBugReport(other, { ...opts, fetchImpl: broken })).code, 'server')
  assert.equal((await submitBugReport({ ...input, title: 'x' }, opts)).code, 'invalid')
})

test('worker: creates labelled issue, never leaks the token, dedupes, rate-limits', async () => {
  const calls: { url: string; init: RequestInit }[] = []
  const env: Env = { GITHUB_TOKEN: 'ghp_secret_token_value_1234567890', GITHUB_REPO: 'o/r', STATE: new MemKV() }
  const deps = { fetchImpl: githubFetch(calls), now: () => 5_000_000 }

  const res = await handleRequest(workerRequest(validBody()), env, deps)
  assert.equal(res.status, 201)
  const text = await res.text()
  assert.ok(!text.includes('ghp_secret'))
  assert.equal(JSON.parse(text).issueNumber, 7)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.github.com/repos/o/r/issues')
  const sentBody = JSON.parse(String(calls[0].init.body))
  assert.deepEqual(sentBody.labels, ['bug', 'user-reported'])
  assert.ok(sentBody.title.startsWith('[Bug] '))
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, `Bearer ${env.GITHUB_TOKEN}`)

  // Same report from a different install: existing issue returned, no second GitHub call.
  const dup = await handleRequest(workerRequest(validBody({ installId: 'other-install-9999' }), '2.2.2.2'), env, deps)
  const dupJson = await dup.json()
  assert.equal(dupJson.duplicate, true)
  assert.equal(dupJson.issueUrl, 'https://github.com/o/r/issues/7')
  assert.equal(calls.length, 1)

  // Per-IP limit.
  let status = 0
  for (let i = 0; i <= LIMITS.perIpPerHour; i++) {
    status = (
      await handleRequest(
        workerRequest(validBody({ title: `Bug number ${i} here`, installId: `install-${1000 + i}-xx` }), '9.9.9.9'),
        env,
        deps
      )
    ).status
  }
  assert.equal(status, 429)
})

test('worker: rejects bad method, content type, malformed and invalid bodies; GitHub failure is generic', async () => {
  const env: Env = { GITHUB_TOKEN: 't', GITHUB_REPO: 'o/r', STATE: new MemKV() }
  const calls: { url: string; init: RequestInit }[] = []
  const deps = { fetchImpl: githubFetch(calls, 500), now: () => 1 }

  assert.equal((await handleRequest(new Request('https://relay.test/', { method: 'GET' }), env, deps)).status, 405)
  assert.equal((await handleRequest(new Request('https://relay.test/', { method: 'POST', body: 'x' }), env, deps)).status, 415)
  const bad = new Request('https://relay.test/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nope' })
  assert.equal((await handleRequest(bad, env, deps)).status, 400)
  assert.equal((await handleRequest(workerRequest(validBody({ title: 'a' })), env, deps)).status, 400)

  const fail = await handleRequest(workerRequest(validBody(), '3.3.3.3'), env, deps)
  assert.equal(fail.status, 502)
  assert.ok(!(await fail.text()).includes('500'))
})

test('worker: screenshot is validated by magic bytes and linked from the issue', async () => {
  const puts: string[] = []
  const env: Env = {
    GITHUB_TOKEN: 't',
    GITHUB_REPO: 'o/r',
    STATE: new MemKV(),
    SCREENSHOTS: { put: async (k: string) => void puts.push(k) },
    SCREENSHOT_PUBLIC_URL: 'https://img.test'
  }
  const calls: { url: string; init: RequestInit }[] = []
  const deps = { fetchImpl: githubFetch(calls), now: () => 42 }

  const fake = Buffer.from('not an image at all').toString('base64')
  const rejected = await handleRequest(
    workerRequest(validBody({ screenshot: { mime: 'image/png', dataBase64: fake } }), '4.4.4.4'),
    env,
    deps
  )
  assert.equal(rejected.status, 400)
  assert.equal(puts.length, 0)

  const accepted = await handleRequest(
    workerRequest(validBody({ screenshot: { mime: 'image/png', dataBase64: PNG_B64 } }), '5.5.5.5'),
    env,
    deps
  )
  assert.equal(accepted.status, 201)
  assert.equal(puts.length, 1)
  assert.ok(puts[0].endsWith('.png'))
  assert.ok(String(JSON.parse(String(calls[0].init.body)).body).includes(`https://img.test/${puts[0]}`))
})
