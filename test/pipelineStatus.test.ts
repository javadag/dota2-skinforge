import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { checkStatus, getBackupDir, assertDirVpk, MOD_FOLDER_NAME } from '../src/main/services/pipeline/pipelineStatus'
import { restoreSignatures, updateSignaturesForGameinfo } from '../src/main/services/dota/signatureService'

test('getBackupDir formats backup directory path correctly', () => {
  const dummyDota = path.join(os.tmpdir(), 'dota_test')
  const backup = getBackupDir(dummyDota, 'custom_mod')
  assert.equal(backup, path.join(dummyDota, 'custom_mod.backup'))

  const defaultBackup = getBackupDir(dummyDota)
  assert.equal(defaultBackup, path.join(dummyDota, `${MOD_FOLDER_NAME}.backup`))
})

test('checkStatus returns clean uninstalled status for nonexistent directory', () => {
  const status = checkStatus(path.join(os.tmpdir(), 'non_existent_dota_dir_' + Date.now()))
  assert.equal(status.validDotaDir, false)
  assert.equal(status.installed, false)
  assert.equal(status.signaturesBypassed, false)
  assert.equal(status.gameinfoConfigured, false)
})

test('assertDirVpk throws on corrupted or non-VPK files', () => {
  const tmpFile = path.join(os.tmpdir(), 'corrupt_test_' + Date.now() + '.vpk')
  fs.writeFileSync(tmpFile, Buffer.from('NOT_A_VALID_VPK_FILE_HEADER'))
  try {
    assert.throws(() => assertDirVpk(tmpFile), /Packed dir VPK failed its header check/)
  } finally {
    fs.unlinkSync(tmpFile)
  }
})

test('checkStatus does not match substring modFolder names in gameinfo_branchspecific.gi', (t) => {
  const tmpDota = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-status-gi-'))
  t.after(() => fs.rmSync(tmpDota, { recursive: true, force: true }))
  const dotaGiDir = path.join(tmpDota, 'dota')
  fs.mkdirSync(dotaGiDir, { recursive: true })
  fs.writeFileSync(
    path.join(dotaGiDir, 'gameinfo_branchspecific.gi'),
    '"GameInfo"\n{\n\tFileSystem\n\t{\n\t\tSearchPaths\n\t\t{\n\t\t\tGame\t\tskinforge\n\t\t\tGame\t\tdota\n\t\t}\n\t}\n}\n',
    'utf8'
  )
  assert.equal(checkStatus(tmpDota, 'skinforge').gameinfoConfigured, true)
  const status = checkStatus(tmpDota, 'skin')
  assert.equal(status.validDotaDir, true)
  assert.equal(status.gameinfoConfigured, false)
})

test('restoreSignatures preserves post-patch dota.signatures instead of restoring a stale backup', (t) => {
  const tmpDota = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-sig-restore-'))
  t.after(() => fs.rmSync(tmpDota, { recursive: true, force: true }))
  const sigDir = path.join(tmpDota, 'bin', 'win64')
  const dotaDir = path.join(tmpDota, 'dota')
  const backupDir = path.join(tmpDota, 'skinforge.backup')
  fs.mkdirSync(sigDir, { recursive: true })
  fs.mkdirSync(dotaDir, { recursive: true })
  fs.mkdirSync(backupDir, { recursive: true })

  fs.writeFileSync(path.join(dotaDir, 'gameinfo_branchspecific.gi'), '"GameInfo"\n{\n}\n', 'utf8')
  fs.writeFileSync(path.join(backupDir, 'dota.signatures'), 'OLD_PATCH_HASH\r\nDIGEST:OLD\r\n', 'utf8')
  const liveSigPath = path.join(sigDir, 'dota.signatures')
  fs.writeFileSync(liveSigPath, 'NEW_PATCH_HASH\r\nDIGEST:NEW\r\n', 'utf8')

  const signed = updateSignaturesForGameinfo(tmpDota, backupDir)
  assert.equal(signed.success, true)
  assert.match(fs.readFileSync(liveSigPath, 'utf8'), /gameinfo_branchspecific\.gi~SHA1:/)

  const restored = restoreSignatures(tmpDota, backupDir)
  assert.equal(restored.success, true)
  assert.equal(restored.status, 'stripped_to_digest')
  assert.equal(fs.readFileSync(liveSigPath, 'utf8'), 'NEW_PATCH_HASH\r\nDIGEST:NEW\r\n')
})
