/**
 * Dota 2 SkinForge — Armory Procedural SVG Card Generator
 */

import { getRarityConfig, type ItemDescriptor } from './rarityConfig'
import { getSlotSvgIcon } from './slotSvgIcons'

export function generateItemSvg(item: ItemDescriptor, slotId = 'weapon', _heroTag = ''): string {
  const conf = getRarityConfig(item)
  const iconSvg = getSlotSvgIcon(slotId, conf.color)
  const rarityName = conf.name.toUpperCase()

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80">
  <defs>
    <radialGradient id="cardBg_${slotId}_${conf.name}" cx="50%" cy="38%" r="65%">
      <stop offset="0%" stop-color="${conf.bg1}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${conf.bg2}" stop-opacity="1"/>
    </radialGradient>
    <linearGradient id="cardBorder_${slotId}_${conf.name}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${conf.color}" stop-opacity="0.95"/>
      <stop offset="50%" stop-color="${conf.color}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${conf.color}" stop-opacity="0.9"/>
    </linearGradient>
  </defs>

  <rect x="1" y="1" width="78" height="78" rx="7" fill="url(#cardBg_${slotId}_${conf.name})"/>
  <rect x="1" y="1" width="78" height="78" rx="7" fill="none" stroke="url(#cardBorder_${slotId}_${conf.name})" stroke-width="1.5"/>

  <line x1="8" y1="20" x2="72" y2="20" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>
  <line x1="8" y1="58" x2="72" y2="58" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>

  <g transform="translate(0, 0)">
    ${iconSvg}
  </g>

  <polygon points="68,6 74,12 68,18 62,12" fill="${conf.color}" opacity="0.95"/>
  <polygon points="68,8 72,12 68,16 64,12" fill="#ffffff" opacity="0.4"/>

  <rect x="8" y="71" width="64" height="2.5" rx="1.25" fill="${conf.color}" opacity="0.9"/>

  <rect x="6" y="58" width="34" height="10" rx="3" fill="rgba(0,0,0,0.7)"/>
  <text x="23" y="65.5" fill="${conf.color}" font-family="system-ui, sans-serif" font-size="6" font-weight="800" text-anchor="middle" letter-spacing="0.5">${rarityName}</text>
</svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
