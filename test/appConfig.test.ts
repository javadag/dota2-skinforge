import test from 'node:test'
import assert from 'node:assert/strict'
import { APP_CONFIG, isValidModFolder, sanitizeModFolder } from '../src/shared/constants/appConfig'
import pkg from '../package.json'

test('appConfig syncs seamlessly with package.json single source of truth', () => {
  assert.equal(APP_CONFIG.version, pkg.version)
  assert.equal(APP_CONFIG.displayVersion, `v${pkg.version}`)
  assert.equal(APP_CONFIG.name, pkg.productName)
  assert.equal(APP_CONFIG.shortName, pkg.shortName)
  assert.equal(APP_CONFIG.modFolder, pkg.modFolder)
  assert.equal(APP_CONFIG.tagline, pkg.tagline)
  assert.equal(APP_CONFIG.description, pkg.description)
})

test('sanitizeModFolder rejects path traversal, reserved Dota dirs, and invalid characters', () => {
  assert.equal(isValidModFolder('skinforge'), true)
  assert.equal(isValidModFolder('my_custom-mod2'), true)
  for (const bad of [
    '',
    ' ',
    '.',
    '..',
    '../dota',
    'a/b',
    'a\\b',
    'dota',
    'DOTA',
    'core',
    'bin',
    'dota_core',
    'CON',
    'nul',
    'has space',
    'line\nbreak'
  ]) {
    assert.equal(isValidModFolder(bad), false, `expected "${bad}" to be invalid`)
    assert.equal(sanitizeModFolder(bad), APP_CONFIG.modFolder)
  }
  assert.equal(sanitizeModFolder('  custom_pack  '), 'custom_pack')
})
