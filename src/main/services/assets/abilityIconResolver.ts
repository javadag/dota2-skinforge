import path from 'node:path'
import { resolveCosmeticStyle } from '../../../shared/armory/itemStyles'
import type { HeroAbilityIcons } from '../../../shared/types/abilityIcons'
import { getOrLoadVpkIndex, readEntry, type VpkIndex } from '../dota/vpkService'
import { buildPlan, buildSchema, ownerFor, personaItemFor, type SchemaItem } from '../modifier'
import { getNode, getString, isNode, materializeDeep, parseVdf, type VdfNode } from '../modifier/vdf'
import { assetModifiers } from '../modifier/visuals'
import { resolveModId } from './armoryService'
import { loadManifest } from './cosmeticAssets'
import { getAbilityIconManifest } from './iconPackService'

export function hasAbilityIconTexture(index: VpkIndex, icon: string): boolean {
  return ['png', 'svg'].some((ext) => index.entries.has(`panorama/images/spellicons/${icon}_${ext}.vtex_c`))
}

export function readAbilityIconModifiers(visuals: VdfNode | undefined) {
  return assetModifiers(visuals).flatMap(({ value }) => {
    if (!isNode(value) || getString(value, 'type') !== 'ability_icon') return []
    const ability = getString(value, 'asset')?.toLowerCase()
    const icon = getString(value, 'modifier')?.toLowerCase()
    if (!ability || !icon) return []
    // Valve's `minimum_priority "1"` marks fallback icons (e.g. Arcana icons that
    // yield to an equipped Immortal), so it has lower priority than a normal modifier.
    const minimumPriority = Number(getString(value, 'minimum_priority')) > 0
    return [
      {
        ability,
        icon,
        node: value,
        style: getString(value, 'style'),
        priority: minimumPriority ? -1 : 0
      }
    ]
  })
}

export function getHeroAbilitySlots(index: VpkIndex, hero: string): Array<{ id: string; slot: number }> {
  const internalName = `npc_dota_hero_${hero}`
  const bytes = readEntry(index, `scripts/npc/heroes/${internalName}.txt`)
  if (!bytes) return []
  const { root } = parseVdf(bytes.toString('utf8'))
  const node = getNode(root, internalName) ?? getNode(getNode(root, 'DOTAHeroes'), internalName)
  const seen = new Set<string>()
  return (node?.entries ?? [])
    .flatMap(({ key, value }) => {
      const slot = /^Ability(\d+)$/i.exec(key)
      if (!slot || typeof value !== 'string' || !/^\w+$/.test(value) || /^(?:generic_hidden|special_bonus_)/.test(value) || seen.has(value))
        return []
      seen.add(value)
      return [{ id: value.toLowerCase(), slot: Number(slot[1]) }]
    })
    .sort((a, b) => a.slot - b.slot)
}

const previewSchemas = new WeakMap<VpkIndex, { text: string; schema: ReturnType<typeof buildSchema>; icons: string[] }>()

function getOrBuildPreviewSchema(index: VpkIndex) {
  let current = previewSchemas.get(index)
  if (!current) {
    const text = readEntry(index, 'scripts/items/items_game.txt')?.toString('utf8')
    if (!text) throw new Error('Dota item schema is missing.')
    const localizationText = readEntry(index, 'resource/localization/abilities_english.txt')?.toString('utf8')
    const icons = getAbilityIconManifest()
      .icons.map((key) => key.slice('spellicons/'.length))
      .filter((icon) => hasAbilityIconTexture(index, icon))
    current = { text, schema: buildSchema(text, { localizationText }), icons }
    previewSchemas.set(index, current)
  }
  return current
}

export function getHeroAbilityIcons(
  dota: string,
  heroTag: string,
  slots: Record<string, string>,
  styles: Record<string, { style?: number }>
): HeroAbilityIcons {
  const index = getOrLoadVpkIndex(path.join(dota, 'dota/pak01_dir.vpk'))
  const { schema, text, icons: available } = getOrBuildPreviewSchema(index)
  const hero = ownerFor(schema, heroTag)
  if (!hero) return { abilities: [], catalog: [], related: [] }
  const hasIcon = new Set(available)
  const related = new Set(available.filter((icon) => icon.startsWith(`${hero}_`) || icon.startsWith(`${hero}/`)))
  const manifest = loadManifest()
  const picks: Record<string, string> = {}
  const customizations: Record<string, { style: number }> = {}
  const displayNames = new Map<string, string>()
  const preferredWearables = new Set<string>()
  for (const [slot, name] of Object.entries(slots)) {
    const id = resolveModId(heroTag, slot, name)
    const item = id && schema.items.get(String(id))
    if (!item) continue
    picks[slot] = item.name
    displayNames.set(item.id, name)
    customizations[slot] = { style: resolveCosmeticStyle(name, styles[slot]?.style) }
    for (const ability of manifest.items[item.id]?.preferWearableAbilityIcons ?? []) {
      preferredWearables.add(ability.toLowerCase())
    }
  }

  function modifiers(item: SchemaItem) {
    const node = item.entry.value
    if (!isNode(node)) return []
    materializeDeep(text, node)
    return readAbilityIconModifiers(getNode(node, 'visuals')).filter(({ icon }) => hasIcon.has(icon))
  }

  const plan = buildPlan(
    schema,
    { [heroTag]: picks },
    { [heroTag]: customizations },
    {
      personaSlotsOnlyIds: manifest.personaSlotsOnlyIds
    }
  )
  const equipped = new Map<string, { icon: string; priority: number; source: string }>()
  for (const { cosmetic, style } of plan.patches) {
    if (!cosmetic) continue
    for (const change of modifiers(cosmetic)) {
      if (change.style !== undefined && Number(change.style) !== style) continue
      const priority = preferredWearables.has(change.ability) && !manifest.items[cosmetic.id] ? Infinity : change.priority
      const current = equipped.get(change.ability)
      if (!current || priority > current.priority) {
        equipped.set(change.ability, {
          icon: change.icon,
          priority,
          source: displayNames.get(cosmetic.id) ?? cosmetic.name
        })
      }
      related.add(change.icon)
    }
  }

  const abilities = getHeroAbilitySlots(index, hero).flatMap(({ id, slot }) => {
    if (!hasIcon.has(id) && !equipped.has(id)) return []
    const change = equipped.get(id)
    const token = `DOTA_Tooltip_ability_${id}`
    const fallback = id
      .replace(new RegExp(`^${hero}_`), '')
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
    return [
      {
        id,
        slot,
        defaultIcon: id,
        equippedIcon: change?.icon ?? id,
        name: schema.localization.get(token) ?? schema.localization.get(token.toLowerCase()) ?? fallback,
        source: change?.source
      }
    ]
  })
  // Persona selectors can supply icons whose names are unrelated to the hero's internal name.
  const persona = personaItemFor(schema, hero)
  if (persona) for (const { icon } of modifiers(persona)) related.add(icon)
  for (const { defaultIcon } of abilities) if (hasIcon.has(defaultIcon)) related.add(defaultIcon)
  return { abilities, catalog: available, related: [...related] }
}
