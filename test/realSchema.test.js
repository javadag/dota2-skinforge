/**
 * Regression harness that runs the engine against the game's real items_game.txt.
 *
 * Nothing here is hardcoded: the arcana heroes, their set pieces and the persona list are
 * all derived from the schema, so the test also fails if the game adds an arcana or a
 * persona that the engine cannot handle.
 *
 * Schema resolution order:
 *   1. `SKINFORGE_ITEMS_GAME` (optional `SKINFORGE_LOCALIZATION`)
 *   2. the installed Dota 2 client, extracted with the bundled vpktool
 *   3. skipped with a notice
 */

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { compileItemsGame } = require('../src/main/services/modifier/compile')
const { buildSchema, personaHeroes, primarySetFor, isPersonaSlot } = require('../src/main/services/modifier/schema')
const { parseVdf, getNode, getString, findAll, isNode } = require('../src/main/services/modifier/vdf')
const { detectDotaPath } = require('../src/main/services/dotaPathService')
const vpkService = require('../src/main/services/vpkService')
const { collectCatalogFindings, catalogEntryCount } = require('../scripts/lib/heroCatalogCheck')

const JUNK =
  /(gem|bundle|rune|record|bitmask|aura|relic|autograph|effect|icons?|cursor|hud|terrain|announcer|music|creep|tower|ward|courier|loading|weather|emblem)/i

async function resolveSchemaFiles() {
  if (process.env.SKINFORGE_ITEMS_GAME) {
    return {
      itemsGame: process.env.SKINFORGE_ITEMS_GAME,
      localization: process.env.SKINFORGE_LOCALIZATION
    }
  }

  const dotaGameDir = detectDotaPath()
  if (!dotaGameDir || !fs.existsSync(dotaGameDir)) return null
  const vpk = path.join(dotaGameDir, 'dota', 'pak01_dir.vpk')
  if (!fs.existsSync(vpk)) return null

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skinforge-schema-'))
  const itemsGame = path.join(outDir, 'items_game.txt')
  const localization = path.join(outDir, 'dota_english.txt')
  await vpkService.extract(vpk, 'scripts/items/items_game.txt', itemsGame)
  let localizationPath
  try {
    await vpkService.extract(vpk, 'resource/localization/dota_english.txt', localization)
    localizationPath = localization
  } catch {
    localizationPath = undefined
  }
  return { itemsGame, localization: localizationPath }
}

function modelOfItem(content, id) {
  const doc = parseVdf(content)
  const entry = getNode(doc.root, 'items').entries.find((candidate) => candidate.key === id)
  if (!entry) return undefined
  return getString(entry.value, 'model_player')
}

async function main() {
  const files = await resolveSchemaFiles()
  if (!files) {
    console.log('⚠ real-schema test skipped: no items_game.txt available (set SKINFORGE_ITEMS_GAME or install Dota 2)')
    return
  }

  const text = fs.readFileSync(files.itemsGame, 'utf-8')
  const localizationText =
    files.localization && fs.existsSync(files.localization) ? fs.readFileSync(files.localization, 'utf-8') : undefined

  const schema = buildSchema(text, { localizationText })
  assert.ok(schema.items.size > 20000, `expected the full schema, parsed ${schema.items.size} items`)
  assert.strictEqual(schema.ambiguousNames.size, 0, 'item names must be unique so name lookups are exact')
  console.log(`✔ real schema: ${schema.items.size} items, ${schema.sets.size} item_sets, ${schema.localization.size} localized tokens`)

  // --- every arcana in the game must resolve to a set of pieces ------------
  const arcanas = [...schema.items.values()].filter(
    (item) =>
      item.rarity === 'arcana' &&
      item.resolvedSlot &&
      (item.prefab === 'wearable' || item.prefab === 'default_item') &&
      !JUNK.test(item.name)
  )
  assert.ok(arcanas.length >= 20, `expected at least 20 arcanas, found ${arcanas.length}`)

  const equipped = {}
  const expectations = []
  for (const arcanum of arcanas) {
    const choice = primarySetFor(schema, arcanum)
    if (!choice) continue
    const hero = arcanum.heroes[0]
    if (!hero || equipped[hero]) continue
    equipped[hero] = { [arcanum.resolvedSlot]: arcanum.name }
    const pieces = choice.set.members.map((name) => schema.byName.get(name)).filter((item) => item && item.model && item.resolvedSlot)
    const setSlots = [...new Set(choice.set.members.map((name) => schema.byName.get(name)?.resolvedSlot).filter(Boolean))]
    expectations.push({ arcanum, hero, pieces, setSlots })
  }
  assert.ok(expectations.length >= 20, `expected at least 20 arcanas with companions, found ${expectations.length}`)

  // --- every persona in the game must be activatable ----------------------
  const personas = personaHeroes(schema)
  assert.ok(personas.length >= 12, `expected at least 12 persona heroes, found ${personas.length}`)
  for (const hero of personas) {
    const persona = schema.personaSelectors.get(hero)?.[0]
    assert.ok(persona, `${hero} has persona variants but no persona selector item`)
    // Merge rather than replace: four heroes have both an arcana and a persona, and the
    // interaction between the two is exactly what this test should exercise.
    equipped[hero] = { ...(equipped[hero] ?? {}), persona_selector: persona.name }
  }

  const { content, report } = compileItemsGame(text, equipped, {}, { localizationText })

  assert.strictEqual(report.validation.ok, true, `generated schema failed validation:\n${report.validation.errors.slice(0, 10).join('\n')}`)
  assert.strictEqual(report.validation.itemCountAfter, report.validation.itemCountBefore, 'no item blocks may be lost')
  console.log(`✔ real schema: compiled ${report.patchedCount} patches across ${report.itemsTouched} items, validation OK`)

  // --- each arcana's set pieces must actually be applied ------------------
  // Except in slots the arcana declares it keeps at default: there, the whole point is that the
  // default item's own model survives so the arcana's `type model` remaps can rewrite it.
  const missing = []
  for (const { arcanum, hero, pieces } of expectations) {
    for (const piece of pieces) {
      if (arcanum.forcesDefaultSlots.includes(piece.resolvedSlot)) continue
      const target = schema.defaults.get(hero)?.get(piece.resolvedSlot)
      if (!target) continue // the hero has no such base slot; nothing to apply to
      const actual = modelOfItem(content, target.id)
      if (actual !== piece.model) missing.push(`${hero}/${piece.resolvedSlot}: ${piece.name}`)
    }
  }
  assert.deepStrictEqual(missing, [], `arcana set pieces not applied:\n  ${missing.join('\n  ')}`)
  console.log(`✔ real schema: all set pieces applied for ${expectations.length} arcanas`)

  // --- slots an arcana forces to default must not be filled by a set piece --
  // A persona may still deliberately re-skin such a slot (its own piece for the slot wins), so
  // the invariant is specifically that *companion pairing* leaves it alone.
  const forcedChecked = []
  for (const { arcanum, hero } of expectations) {
    for (const slot of arcanum.forcesDefaultSlots) {
      if (!schema.defaults.get(hero)?.get(slot)) continue
      forcedChecked.push(`${hero}/${slot}`)
      const paired = report.applied.find((entry) => entry.hero === hero && entry.slot === slot && entry.reason === 'set-companion')
      assert.strictEqual(
        paired,
        undefined,
        `${hero}/${slot}: "${arcanum.name}" keeps this slot at default, so no set piece may be paired into it`
      )
    }
  }
  assert.ok(forcedChecked.length > 0, 'expected at least one arcana to force a slot to its default')
  console.log(`✔ real schema: forced-default slots left to the arcana (${forcedChecked.join(', ')})`)

  // --- behavioural directives must never land on a default item ------------
  // `named_value` entries describe an equipped item instance. Copying the slot-claiming one
  // onto a default item makes the client think that item is claiming a slot, which is what
  // produces "Conflicting items were equipped" and unequips the hero's base in the armory.
  const parsed = parseVdf(content)
  const itemsNode = getNode(parsed.root, 'items')
  const entryById = new Map(itemsNode.entries.map((entry) => [entry.key, entry]))

  const leaked = []
  for (const targetId of new Set(report.applied.map((entry) => entry.targetId))) {
    const entry = entryById.get(targetId)
    if (!entry || typeof entry.value === 'string') continue
    const visuals = getNode(entry.value, 'visuals')
    if (!visuals) continue
    const named = findAll(visuals, 'asset_modifier').filter(
      (modifier) => isNode(modifier.value) && getString(modifier.value, 'type') === 'named_value'
    )
    if (named.length > 0) leaked.push(`${targetId} (${schema.items.get(targetId)?.name ?? '?'})`)
  }
  assert.deepStrictEqual(leaked, [], `default items must not carry named_value directives: ${leaked.join(', ')}`)
  console.log('✔ real schema: no behavioural named_value directives copied onto default items')

  // --- hero_base arcanas must reach a slot their own set does not occupy ---
  // These declare their body only via `entity_model`, and `hero_base` is never resolved by
  // the client. An owner has the arcana's own set equipped, so mirroring the swap onto only
  // those slots would do nothing at all.
  const swapCount = (targetId, hero) => {
    const entry = entryById.get(targetId)
    if (!entry || typeof entry.value === 'string') return 0
    const visuals = getNode(entry.value, 'visuals')
    if (!visuals) return 0
    return findAll(visuals, 'asset_modifier').filter(
      (modifier) =>
        isNode(modifier.value) &&
        getString(modifier.value, 'type') === 'entity_model' &&
        getString(modifier.value, 'asset') === `npc_dota_hero_${hero}`
    ).length
  }

  // Two invariants, both learned from a real report: a player who owned the arcana had the
  // arcana's own set equipped, so every default item for a slot that set covers went unused —
  // and the body swap had been mirrored onto exactly one such slot. The hero rendered with its
  // base skin while the arcana's effects worked.
  //   1. a `hero_base` arcana that swaps the hero entity must reach a wearable default, so a
  //      player with nothing equipped still gets the arcana body;
  //   2. when the set does not cover every model-bearing wearable, the swap must also reach a
  //      slot the set leaves free, so a player who owns the arcana still gets it.
  // Arcanas that swap no hero entity at all (Monkey King's retunes the models of other
  // wearables via `type model` instead) are instead checked for having been applied at all.
  const failures = []
  let heroBaseChecked = 0
  let entitySwapArcanas = 0
  for (const { arcanum, hero, setSlots } of expectations) {
    if (arcanum.resolvedSlot !== 'hero_base') continue
    heroBaseChecked++

    const declared = entryById.get(arcanum.id)
    const declaredVisuals = declared && typeof declared.value !== 'string' ? getNode(declared.value, 'visuals') : undefined
    const swapsHeroEntity = Boolean(
      declaredVisuals &&
      findAll(declaredVisuals, 'asset_modifier').some(
        (modifier) =>
          isNode(modifier.value) &&
          getString(modifier.value, 'type') === 'entity_model' &&
          getString(modifier.value, 'asset') === `npc_dota_hero_${hero}`
      )
    )

    if (!swapsHeroEntity) {
      const base = schema.defaults.get(hero)?.get('hero_base')
      const baseEntry = base ? entryById.get(base.id) : undefined
      const baseVisuals = baseEntry && typeof baseEntry.value !== 'string' ? getNode(baseEntry.value, 'visuals') : undefined
      if (!baseVisuals || findAll(baseVisuals, 'asset_modifier').length === 0) {
        failures.push(`${hero} (${arcanum.name}): arcana visuals were not applied to its hero_base default item`)
      }
      continue
    }
    entitySwapArcanas++

    const covered = new Set(setSlots)
    const wearables = [...(schema.defaults.get(hero) ?? [])].filter(
      ([slot, item]) => slot !== 'hero_base' && !isPersonaSlot(slot) && Boolean(item.model)
    )
    const anchoredSlots = wearables.filter(([, item]) => swapCount(item.id, hero) > 0).map(([slot]) => slot)
    if (anchoredSlots.length === 0) {
      failures.push(`${hero} (${arcanum.name}): no wearable default carries the body swap`)
      continue
    }
    const freeSlots = wearables.filter(([slot]) => !covered.has(slot)).map(([slot]) => slot)
    if (freeSlots.length > 0 && !freeSlots.some((slot) => anchoredSlots.includes(slot))) {
      failures.push(`${hero} (${arcanum.name}): swap missing from the slots its set leaves free (${freeSlots.join(', ')})`)
    }
  }
  assert.ok(heroBaseChecked > 0, 'expected some hero_base arcanas to check')
  assert.ok(entitySwapArcanas > 0, 'expected some hero_base arcanas to swap the hero entity')
  assert.deepStrictEqual(failures, [], `hero_base arcanas are not reachable:\n  ${failures.join('\n  ')}`)
  console.log(
    `✔ real schema: ${heroBaseChecked} hero_base arcanas reachable (${entitySwapArcanas} swap the hero entity, ${heroBaseChecked - entitySwapArcanas} retune wearables)`
  )

  // --- no model-less slot may ever be nulled -----------------------------
  const nulled = report.applied.filter((entry) => entry.reason === 'persona-hide')
  for (const entry of nulled) {
    assert.ok(schema.items.get(entry.targetId)?.model, `${entry.hero}/${entry.slot} was hidden but its default item renders no model`)
  }
  console.log(`✔ real schema: ${nulled.length} persona-hidden slots, all with real geometry`)

  // --- entityModelOverrides must be populated for heroes with Arcanas and Personas ---
  assert.ok(report.entityModelOverrides && report.entityModelOverrides.length > 0, 'entityModelOverrides must not be empty')
  const wrOverride = report.entityModelOverrides.find((o) => o.hero === 'windrunner')
  assert.ok(wrOverride, 'Windranger arcana must have an entityModelOverride')
  assert.strictEqual(wrOverride.baseModel, 'models/heroes/windrunner/windrunner.vmdl')
  assert.strictEqual(wrOverride.overrideModel, 'models/items/windrunner/windrunner_arcana/wr_arcana_base.vmdl')

  const ogreOverride = report.entityModelOverrides.find((o) => o.hero === 'ogre_magi')
  assert.ok(ogreOverride, 'Ogre Magi arcana must have an entityModelOverride')
  assert.strictEqual(ogreOverride.baseModel, 'models/heroes/ogre_magi/ogre_magi.vmdl')
  assert.strictEqual(ogreOverride.overrideModel, 'models/items/ogre_magi/ogre_arcana/ogre_magi_arcana.vmdl')

  const amOverride = report.entityModelOverrides.find((o) => o.hero === 'antimage')
  assert.ok(amOverride, 'Anti-Mage persona must have an entityModelOverride')
  assert.strictEqual(amOverride.baseModel, 'models/heroes/antimage/antimage.vmdl')
  assert.strictEqual(amOverride.overrideModel, 'models/heroes/antimage_female/antimage_female.vmdl')
  console.log(`✔ real schema: entityModelOverrides generated for ${report.entityModelOverrides.length} heroes with Arcanas/Personas`)

  // --- the shipped UI catalog must agree with the schema -------------------
  // This is the check that would have caught Legion Commander's arcana being offered twice in the
  // weapon picker after Valve re-slotted it, instead of someone noticing in a real match.
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'valveHeroCatalog.json'), 'utf-8'))
  const catalogErrors = collectCatalogFindings(catalog, schema).filter((finding) => finding.level === 'error')
  assert.deepStrictEqual(
    catalogErrors.map((finding) => `${finding.where}: ${finding.message}`),
    [],
    'the hero catalog must agree with the schema (run `npm run fix:catalog`)'
  )
  console.log(`✔ real schema: hero catalog agrees with the schema (${catalogEntryCount(catalog)} entries)`)

  assert.strictEqual(report.validation.errors.length, 0)
  console.log(`✔ all real-schema regression checks passed (${arcanas.length} arcanas, ${personas.length} personas)`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
