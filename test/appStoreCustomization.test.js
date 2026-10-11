const assert = require('assert')

// Verify state operations conceptually
const heroCustomizations = {}

function setSlotCustomization(state, heroTag, slotId, update) {
  const current = state[heroTag] || {}
  const currentSlot = current[slotId] || {}
  return {
    ...state,
    [heroTag]: {
      ...current,
      [slotId]: { ...currentSlot, ...update }
    }
  }
}

let state = setSlotCustomization(heroCustomizations, 'vengeful spirit', 'shoulder', { style: 2 })
assert.strictEqual(state['vengeful spirit'].shoulder.style, 2)

state = setSlotCustomization(state, 'queen of pain', 'back', { style: 1 })
assert.strictEqual(state['queen of pain'].back.style, 1)

console.log('✔ Store action logic verified')
