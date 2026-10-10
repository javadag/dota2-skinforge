/**
 * Dota 2 SkinForge — Cosmetic Compiler
 */

import { parseItemsGame, type DefaultItemEntry } from './vdfParser'
import { findBestCosmetic, findDefaultItem } from './matcher'
import { getCanonicalHero } from '../../../shared/constants/heroAliases'
import { getCosmeticCustomizationInfo } from '../../../shared/constants/arcanaStyles'
import type { HeroCustomizationsMap } from '../../../shared/types/customization'
import { rules, type CosmeticPartial } from './rules'
import { resolveEquippedArcanasAndPersonas, NULL_MODEL } from './arcanaResolver'

export interface PatchReplacement {
  start: number
  end: number
  replacement: string
}

export interface CompilerResult {
  modifiedContent: string
  patchedCount: number
}

export function unrollVisualsBlock(
  visualsBlock: string,
  targetStyle: number
): { block: string; modelOverride?: string; skinOverride?: number } {
  const vIdx = visualsBlock.indexOf('"visuals"')
  if (vIdx === -1) return { block: visualsBlock }

  const vOpen = visualsBlock.indexOf('{', vIdx)
  if (vOpen === -1) return { block: visualsBlock }

  const inside = visualsBlock.substring(vOpen + 1, visualsBlock.lastIndexOf('}'))
  let modelOverride: string | undefined
  let skinOverride: number | undefined

  const chunks: string[] = []
  let pos = 0
  while (pos < inside.length) {
    const modIdx = inside.indexOf('"asset_modifier', pos)
    if (modIdx === -1) {
      const rem = inside.substring(pos).trim()
      if (rem) chunks.push(rem)
      break
    }

    const before = inside.substring(pos, modIdx).trim()
    if (before) chunks.push(before)

    const braceOpen = inside.indexOf('{', modIdx)
    if (braceOpen === -1) break

    let depth = 1
    let cur = braceOpen + 1
    while (cur < inside.length && depth > 0) {
      if (inside[cur] === '{') depth++
      else if (inside[cur] === '}') depth--
      cur++
    }

    const modBlock = inside.substring(modIdx, cur)
    pos = cur

    const styleMatch = modBlock.match(/"style"\s*"(\d+)"/)
    if (styleMatch) {
      const modStyle = parseInt(styleMatch[1], 10)
      if (modStyle === targetStyle) {
        // Strip the style property to make it unconditional in Source 2
        const stripped = modBlock.replace(/"style"\s*"(\d+)"\s*/, '').trim()
        const modelMatch = stripped.match(/"type"\s*"entity_model"[\s\S]*?"modifier"\s*"([^"]+)"/)
        if (modelMatch) {
          modelOverride = modelMatch[1]
        }
        const skinMatch = stripped.match(/"type"\s*"model_skin"[\s\S]*?"skin"\s*"(\d+)"/)
        if (skinMatch) {
          skinOverride = parseInt(skinMatch[1], 10)
        }
        chunks.push(stripped)
      }
    } else {
      // Common modifier
      chunks.push(modBlock.trim())
    }
  }

  const newVisuals = `\t\t"visuals"\n\t\t{\n\t\t\t${chunks.join('\n\t\t\t')}\n\t\t}`
  return { block: newVisuals, modelOverride, skinOverride }
}

export function applyModModifications(
  content: string,
  equipped: Record<string, Record<string, string>> = {},
  customizations: HeroCustomizationsMap = {}
): CompilerResult {
  const { defaultItems, cosmetics } = parseItemsGame(content)
  let modifiedContent = content

  const replacementMap = new Map<string, PatchReplacement>()

  function patchDefaultItem(defaultItem: DefaultItemEntry, cosmetic: CosmeticPartial): void {
    if (!defaultItem) return
    const existing = replacementMap.get(defaultItem.id)
    let currentBlock = existing ? existing.replacement : defaultItem.block

    // Replace model_player if cosmetic has a model
    if (cosmetic.model) {
      if (currentBlock.includes('"model_player"')) {
        currentBlock = currentBlock.replace(/"model_player"\s+"[^"]+"/, `"model_player"\t\t"${cosmetic.model}"`)
      } else {
        currentBlock = currentBlock.replace(/(\t*\}\s*)$/, `\t\t"model_player"\t\t"${cosmetic.model}"\n$1`)
      }
    }

    // Add particle_folder if cosmetic has one
    if (cosmetic.particleFolder) {
      if (currentBlock.includes('"particle_folder"')) {
        currentBlock = currentBlock.replace(/"particle_folder"\s+"[^"]+"/, `"particle_folder"\t\t"${cosmetic.particleFolder}"`)
      } else {
        currentBlock = currentBlock.replace(/(\t*\}\s*)$/, `\t\t"particle_folder"\t\t"${cosmetic.particleFolder}"\n$1`)
      }
    }

    // Add or merge visuals block
    if (cosmetic.visualsBlock) {
      if (currentBlock.includes('"visuals"')) {
        const vIdx = currentBlock.indexOf('"visuals"')
        const vOpen = currentBlock.indexOf('{', vIdx)
        let depth = 1
        let vClose = vOpen + 1
        while (vClose < currentBlock.length && depth > 0) {
          if (currentBlock[vClose] === '{') depth++
          else if (currentBlock[vClose] === '}') depth--
          vClose++
        }
        currentBlock = currentBlock.substring(0, vIdx) + cosmetic.visualsBlock + currentBlock.substring(vClose)
      } else {
        currentBlock = currentBlock.replace(/(\t*\}\s*)$/, `\t\t${cosmetic.visualsBlock}\n$1`)
      }
    }

    // Add or merge portraits block
    if (cosmetic.portraitsBlock) {
      if (currentBlock.includes('"portraits"')) {
        const pIdx = currentBlock.indexOf('"portraits"')
        const pOpen = currentBlock.indexOf('{', pIdx)
        let depth = 1
        let pClose = pOpen + 1
        while (pClose < currentBlock.length && depth > 0) {
          if (currentBlock[pClose] === '{') depth++
          else if (currentBlock[pClose] === '}') depth--
          pClose++
        }
        currentBlock = currentBlock.substring(0, pIdx) + cosmetic.portraitsBlock + currentBlock.substring(pClose)
      } else {
        currentBlock = currentBlock.replace(/(\t*\}\s*)$/, `\t\t${cosmetic.portraitsBlock}\n$1`)
      }
    }

    replacementMap.set(defaultItem.id, {
      start: defaultItem.start,
      end: defaultItem.end,
      replacement: currentBlock
    })
  }

  const { resolvedEquipped, slotsToHide } = resolveEquippedArcanasAndPersonas(equipped)

  for (const [heroTag, slots] of Object.entries(resolvedEquipped)) {
    if (!slots || typeof slots !== 'object') continue

    for (const [slotId, itemName] of Object.entries(slots)) {
      if (!itemName || typeof itemName !== 'string') continue
      const cleanItemName = itemName.trim()
      if (cleanItemName.toLowerCase().includes('official base') || cleanItemName.toLowerCase() === 'default') {
        continue
      }

      const cosmetic = findBestCosmetic(cosmetics, heroTag, slotId, cleanItemName)
      if (!cosmetic) continue

      let defaultItem = findDefaultItem(defaultItems, heroTag, slotId)
      if (!defaultItem && cosmetic.slot) {
        defaultItem = findDefaultItem(defaultItems, heroTag, cosmetic.slot)
      }
      if (!defaultItem) continue

      // Process customizations (e.g. style unrolling)
      const customization = customizations[heroTag]?.[slotId]
      const patchedCosmetic: CosmeticPartial = { ...cosmetic }

      if (customization && customization.style !== undefined && cosmetic.visualsBlock) {
        const targetStyle = customization.style
        const { block, modelOverride, skinOverride } = unrollVisualsBlock(cosmetic.visualsBlock, targetStyle)
        patchedCosmetic.visualsBlock = block

        // Check registry metadata as fallback for models and skins
        const regInfo = getCosmeticCustomizationInfo(heroTag, slotId, cleanItemName)
        const chosenStyle = regInfo?.styles?.[targetStyle]

        const effectiveModel = modelOverride || chosenStyle?.model
        if (effectiveModel) {
          patchedCosmetic.model = effectiveModel
        }

        const effectiveSkin = skinOverride !== undefined ? skinOverride : chosenStyle?.skin
        if (effectiveSkin !== undefined) {
          const skinSnippet = `\t\t\t"asset_modifier"\n\t\t\t{\n\t\t\t\t"type"\t\t"model_skin"\n\t\t\t\t"skin"\t\t"${effectiveSkin}"\n\t\t\t}\n`
          if (patchedCosmetic.visualsBlock.includes('{')) {
            patchedCosmetic.visualsBlock = patchedCosmetic.visualsBlock.replace(/(\t*\}\s*)$/, `${skinSnippet}$1`)
          }
        }
      }

      patchDefaultItem(defaultItem, patchedCosmetic)
    }

    // Hide incompatible base slots (e.g. for personas or full body arcanas)
    const toHide = slotsToHide[heroTag]
    if (toHide && toHide.size > 0) {
      for (const hideSlot of toHide) {
        const defItem = findDefaultItem(defaultItems, heroTag, hideSlot)
        if (defItem) {
          patchDefaultItem(defItem, { model: NULL_MODEL })
        }
      }
    }

    // Execute any registered hero-specific Arcana rules
    const canonical = getCanonicalHero(heroTag)
    const cleanHero = canonical.replace(/[^a-z0-9]/g, '')

    for (const rule of rules) {
      if (rule.hero === cleanHero) {
        rule.apply({
          heroTag,
          slots,
          cosmetics,
          defaultItems,
          patchDefaultItem,
          customizations
        })
      }
    }
  }

  // Sort replacements in reverse order so character offsets do not shift
  const replacements = Array.from(replacementMap.values())
  replacements.sort((a, b) => b.start - a.start)

  for (const r of replacements) {
    modifiedContent = modifiedContent.substring(0, r.start) + r.replacement + modifiedContent.substring(r.end)
  }

  return { modifiedContent, patchedCount: replacements.length }
}

export default applyModModifications
