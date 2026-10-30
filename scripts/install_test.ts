/**
 * End-to-end install test against a throwaway game folder (no real game files touched).
 *
 *   npx tsx scripts/install_test.ts
 */
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { detectDotaPath } from '../src/main/services/dotaPathService'
import * as pipeline from '../src/main/services/pipelineService'

const REAL = detectDotaPath()
if (!REAL) throw new Error('Dota 2 not detected')
const REAL_DIR: string = REAL

const ROOT = path.resolve('scratch', 'fake_game')
const MOD = 'skinforge'

let failures = 0
const check = (name: string, ok: boolean, detail = ''): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failures++
}

function makeFakeGame(): string {
  fs.rmSync(ROOT, { recursive: true, force: true })
  fs.mkdirSync(path.join(ROOT, 'dota'), { recursive: true })
  fs.mkdirSync(path.join(ROOT, 'bin', 'win64'), { recursive: true })
  fs.copyFileSync(path.join(REAL_DIR, 'dota', 'gameinfo_branchspecific.gi'), path.join(ROOT, 'dota', 'gameinfo_branchspecific.gi'))
  fs.copyFileSync(path.join(REAL_DIR, 'bin', 'win64', 'dota.signatures'), path.join(ROOT, 'bin', 'win64', 'dota.signatures'))
  return ROOT
}

async function main(): Promise<void> {
  const fake = makeFakeGame()
  const originalGameinfo = fs.readFileSync(path.join(fake, 'dota', 'gameinfo_branchspecific.gi'), 'utf-8')
  const originalSigs = fs.readFileSync(path.join(fake, 'bin', 'win64', 'dota.signatures'), 'utf-8')

  console.log('building pack from the real install...')
  const pack = await pipeline.buildSelectionPack({
    dotaGameDir: REAL_DIR,
    picks: [{ hero: 'zeus', slot: 'head', item: 'Arc of the Sovereign Head' }],
    outDir: path.resolve('scratch', 'install_test_pack')
  })
  check('pack built', fs.existsSync(pack.dirVpk) && pack.patchBlocks > 0, `${pack.patchBlocks} blocks`)

  const before = await pipeline.checkStatus(fake, MOD)
  check('status before install is clean', before.installed === false)

  const installed = await pipeline.installPack(fake, pack, () => {}, MOD)
  check('install returned success', installed.success, installed.success ? '' : installed.error)

  const dirVpk = path.join(fake, MOD, 'pak01_dir.vpk')
  const chunkVpk = path.join(fake, MOD, 'pak01_000.vpk')
  check('dir vpk copied', fs.existsSync(dirVpk))
  check('chunk vpk copied', fs.existsSync(chunkVpk))

  const gameinfoAfter = fs.readFileSync(path.join(fake, 'dota', 'gameinfo_branchspecific.gi'), 'utf-8')
  check('mount added', new RegExp(`Game\\s+${MOD}`).test(gameinfoAfter))
  check('previous mount preserved', /Dota2SkinChanger/.test(gameinfoAfter))

  const sigsAfter = fs.readFileSync(path.join(fake, 'bin', 'win64', 'dota.signatures'), 'utf-8')
  const lastLine = sigsAfter.trimEnd().split(/\r?\n/).pop() ?? ''
  const expectedSha1 = crypto
    .createHash('sha1')
    .update(fs.readFileSync(path.join(fake, 'dota', 'gameinfo_branchspecific.gi')))
    .digest('hex')
    .toUpperCase()
  check('signature entry appended', /gameinfo_branchspecific\.gi~SHA1:/.test(lastLine))
  check('signature matches the new gameinfo', lastLine.includes(expectedSha1), lastLine.slice(0, 80))

  const after = await pipeline.checkStatus(fake, MOD)
  check('status reports installed', after.installed === true, JSON.stringify(after))

  const removed = await pipeline.uninstallMods(fake, () => {}, MOD)
  check('uninstall returned success', removed.success)
  check('mod folder removed', !fs.existsSync(path.join(fake, MOD)))
  check(
    'gameinfo restored byte-for-byte',
    fs.readFileSync(path.join(fake, 'dota', 'gameinfo_branchspecific.gi'), 'utf-8') === originalGameinfo
  )
  check('signatures restored byte-for-byte', fs.readFileSync(path.join(fake, 'bin', 'win64', 'dota.signatures'), 'utf-8') === originalSigs)

  console.log(failures ? `\n${failures} failure(s)` : '\nall install checks passed')
  process.exit(failures ? 1 : 0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
