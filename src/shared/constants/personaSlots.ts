/**
 * Dota 2 SkinForge — Persona Slot Detection & Classification
 */

export const isPersonaSlotId = (slotId: string): boolean =>
  slotId === 'persona' || slotId === 'persona_selector' || slotId.startsWith('persona_') || slotId.includes('_persona_')
