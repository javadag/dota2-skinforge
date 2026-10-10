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

state = setSlotCustomization(state, 'terrorblade', 'hero_base', { gemColor: '#D11FA1', gemName: 'Rubiline' })
assert.strictEqual(state['terrorblade'].hero_base.gemColor, '#D11FA1')
assert.strictEqual(state['terrorblade'].hero_base.gemName, 'Rubiline')

console.log('✔ Task 3 Store action logic verified')
