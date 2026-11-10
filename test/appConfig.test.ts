import test from 'node:test'
import assert from 'node:assert/strict'
import { APP_CONFIG } from '../src/shared/constants/appConfig'
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
