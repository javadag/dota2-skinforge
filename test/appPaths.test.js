const assert = require('assert')
const fs = require('fs')
const path = require('path')
const {
  getAppRoot,
  getDataPath,
  getToolsPath,
  getStagingPackPath,
  getAssetsPath,
  getStagingIconsPath
} = require('../src/main/services/appPathService')

console.log('Testing App Path Service...')

// 1. Root verification
const root = getAppRoot()
assert.ok(fs.existsSync(path.join(root, 'package.json')), 'getAppRoot must return directory with package.json')

// 2. Data path verification
const heroesPath = getDataPath('heroes.json')
assert.ok(fs.existsSync(heroesPath), `heroes.json must exist at ${heroesPath}`)
const heroesData = JSON.parse(fs.readFileSync(heroesPath, 'utf8'))
assert.ok(Array.isArray(heroesData.heroes), 'heroesData.heroes must be an array')
assert.ok(heroesData.heroes.length > 0, `Expected >0 heroes, got ${heroesData.heroes.length}`)

const templatePath = getDataPath('mod_template.zip')
assert.ok(fs.existsSync(templatePath), `mod_template.zip must exist at ${templatePath}`)

// 3. Tools path verification
const vpkToolPath = getToolsPath('vpktool.exe')
assert.ok(fs.existsSync(vpkToolPath), `vpktool.exe must exist at ${vpkToolPath}`)

// 4. Staging pack path verification
const stagingPath = getStagingPackPath()
assert.strictEqual(stagingPath, path.join(root, '.staging_pack'), 'Staging path must be in project root')

// 5. Assets path verification
const iconPath = getAssetsPath('icon.jpg')
assert.ok(fs.existsSync(iconPath), `icon.jpg must exist at ${iconPath}`)
const iconPngPath = getAssetsPath('icon.png')
assert.ok(fs.existsSync(iconPngPath), `icon.png must exist at ${iconPngPath}`)
const iconIcoPath = getAssetsPath('icon.ico')
assert.ok(fs.existsSync(iconIcoPath), `icon.ico must exist at ${iconIcoPath}`)

// 6. Staging icons path verification
const stagingIconsPath = getStagingIconsPath('econ')
assert.strictEqual(stagingIconsPath, path.join(root, '.staging_icons', 'webp', 'econ'))

console.log('App Path Service tests passed cleanly!')
