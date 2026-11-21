import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseVdf } from '../src/main/services/modifier/vdf'
import { remapHeroPortraits } from '../src/main/services/assets/heroPortraits'

const SAMPLE_PORTRAITS = `"Portraits"
{
\t"models/heroes/axe/axe.vmdl"
\t{
\t\t"PortraitAnimationActivity"\t\t"ACT_DOTA_IDLE"
\t\t"cameras"
\t\t{
\t\t\t"default"
\t\t\t{
\t\t\t\t"PortraitPosition"\t\t"166.15 -166.83 60.25"
\t\t\t\t"PortraitAngles"\t\t"337.05 136.08 0.00"
\t\t\t}
\t\t}
\t}
\t"models/items/axe/ti9_jungle_axe/axe_bare.vmdl"
\t{
\t\t"PortraitAnimationActivity"\t\t"ACT_DOTA_CAPTURE"
\t\t"cameras"
\t\t{
\t\t\t"default"
\t\t\t{
\t\t\t\t"PortraitPosition"\t\t"178.332062 -90.087120 111.539337"
\t\t\t\t"PortraitAngles"\t\t"348.249969 158.479752 0.000000"
\t\t\t}
\t\t}
\t}
}
`

test('remapHeroPortraits copies the cosmetic model camera block onto the vanilla hero model key', () => {
  const result = remapHeroPortraits(SAMPLE_PORTRAITS, [
    {
      baseModel: 'models/heroes/axe/axe.vmdl',
      overrideModel: 'models/items/axe/ti9_jungle_axe/axe_bare.vmdl'
    }
  ])
  assert.ok(result, 'expected remapped portraits.txt buffer')
  const text = result.toString('utf8')
  const parsed = parseVdf(text)
  assert.equal(parsed.key, 'Portraits')
  assert.ok(text.includes('"PortraitPosition"\t\t"178.332062 -90.087120 111.539337"'))
  assert.ok(!text.includes('"PortraitPosition"\t\t"166.15 -166.83 60.25"'))
  assert.ok(text.includes('"ACT_DOTA_CAPTURE"'))
})

test('remapHeroPortraits inserts a portrait entry when the vanilla model has no explicit block', () => {
  const withoutBase = SAMPLE_PORTRAITS.replace(
    '\t"models/heroes/axe/axe.vmdl"\n\t{\n\t\t"PortraitAnimationActivity"\t\t"ACT_DOTA_IDLE"\n\t\t"cameras"\n\t\t{\n\t\t\t"default"\n\t\t\t{\n\t\t\t\t"PortraitPosition"\t\t"166.15 -166.83 60.25"\n\t\t\t\t"PortraitAngles"\t\t"337.05 136.08 0.00"\n\t\t\t}\n\t\t}\n\t}\n',
    ''
  )
  const result = remapHeroPortraits(withoutBase, [
    {
      baseModel: 'models/heroes/axe/axe.vmdl',
      overrideModel: 'models/items/axe/ti9_jungle_axe/axe_bare.vmdl'
    }
  ])
  assert.ok(result)
  const text = result.toString('utf8')
  const parsed = parseVdf(text)
  assert.equal(parsed.root.entries.length, 2)
  assert.ok(text.includes('"models/heroes/axe/axe.vmdl"'))
})

test('remapHeroPortraits returns null when no remaps match or override is missing', () => {
  assert.equal(remapHeroPortraits(SAMPLE_PORTRAITS, []), null)
  assert.equal(
    remapHeroPortraits(SAMPLE_PORTRAITS, [{ baseModel: 'models/heroes/axe/axe.vmdl', overrideModel: 'models/nonexistent.vmdl' }]),
    null
  )
})
