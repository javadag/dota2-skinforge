/**
 * gameinfo injection regression test (operates on a fake game dir).
 *   npx tsx scripts/gameinfo_test.ts
 */
import fs from 'fs'
import path from 'path'
import * as gameinfo from '../src/main/services/gameinfoService'

const REAL = 'D:\\SteamLibrary\\steamapps\\common\\dota 2 beta\\game\\dota\\gameinfo_branchspecific.gi'
const ROOT = path.resolve('scratch', 'gameinfo_test')

function makeDir(name: string, content: string): string {
  const dir = path.join(ROOT, name)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(path.join(dir, 'dota'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'dota', 'gameinfo_branchspecific.gi'), content, 'utf-8')
  return dir
}

const lines = (text: string): string[] => text.split(/\r?\n/).filter((l) => /^\s*(Game|Mod)\s+\S/.test(l))

let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failures++
}

// A. clean gameinfo with no SearchPaths block at all
const clean = `"GameInfo"\n{\n\tgame \t\t"Dota 2"\n\ttitle \t\t"Dota 2"\n\n\tFileSystem\n\t{\n\t\tSteamAppId\t\t\t\t570\n\t}\n}\n`
const a = makeDir('clean', clean)
gameinfo.injectSearchPaths(a, 'skinforge', path.join(a, 'backup'))
const aText = fs.readFileSync(path.join(a, 'dota', 'gameinfo_branchspecific.gi'), 'utf-8')
check('clean file gets a full SearchPaths template', aText.includes('SearchPaths') && aText.includes('Game\t\t\t\tskinforge'))
check('clean file still mounts dota and core', /Game\s+dota/.test(aText) && /Game\s+core/.test(aText))
check('backup written', fs.existsSync(path.join(a, 'backup', 'gameinfo_branchspecific.gi')))

// B. gameinfo that already mounts another mod
const other = fs.readFileSync(REAL, 'utf-8')
const b = makeDir('other', other)
gameinfo.injectSearchPaths(b, 'skinforge', path.join(b, 'backup'))
const bText = fs.readFileSync(path.join(b, 'dota', 'gameinfo_branchspecific.gi'), 'utf-8')
const bLines = lines(bText)
check('existing mount preserved', /Game\s+Dota2SkinChanger/.test(bText))
check('new mount added', /Game\s+skinforge/.test(bText))
const firstGame = bLines.find((l) => /^\s*Game\s+\S/.test(l) && !/Game_/.test(l)) ?? ''
check('new mount takes priority', /skinforge/.test(firstGame), `first Game line = ${firstGame.trim()}`)
check('only one skinforge Game line', bLines.filter((l) => /^\s*Game\s+skinforge\s*$/.test(l)).length === 1)

// C. idempotent
const before = bText
gameinfo.injectSearchPaths(b, 'skinforge', path.join(b, 'backup'))
check('second inject is a no-op', fs.readFileSync(path.join(b, 'dota', 'gameinfo_branchspecific.gi'), 'utf-8') === before)

// D. restore
gameinfo.restoreGameinfo(b, path.join(b, 'backup'))
check('restore is byte-identical', fs.readFileSync(path.join(b, 'dota', 'gameinfo_branchspecific.gi'), 'utf-8') === other)

console.log(failures ? `\n${failures} failure(s)` : '\nall gameinfo checks passed')
process.exit(failures ? 1 : 0)
