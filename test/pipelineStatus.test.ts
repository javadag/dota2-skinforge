import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { checkStatus, getBackupDir, assertDirVpk, MOD_FOLDER_NAME } from '../src/main/services/pipeline/pipelineStatus'

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
