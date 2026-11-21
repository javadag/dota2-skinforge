import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reconnectPairRules, wearableMergeRules, type ReconnectRule } from '../src/shared/utils/reconnectRules'

test('grouping slots preserves interleaved carrier priorities and body merge order without mutating rules', () => {
  const rules: ReconnectRule[] = [
    {
      hero: 'example',
      slot: 'head',
      companions: [
        { set: 'first', slot: 'back', order: 0 },
        { set: 'last', slot: 'arms', order: 2 }
      ],
      merges: [
        {
          group: 'example',
          hostSlot: 'back',
          guestStyle: 1,
          bakedGuestSkin: '2',
          preserveGuestVisuals: true,
          order: 0
        },
        { group: 'example', hostModel: 'body.vmdl', order: 2 }
      ]
    },
    {
      hero: 'example',
      slot: 'misc',
      companions: [{ set: 'middle', slot: 'back', order: 1 }],
      merges: [
        {
          group: 'example',
          hostModel: 'body.vmdl',
          applyTime: {
            stockBodySha256: 'body',
            wearableSha256s: ['misc'],
            checkWeightedBind: 'near',
            additionalWearable: { model: 'water.vmdl', sha256: 'water' }
          },
          order: 1
        }
      ]
    }
  ]
  const before = structuredClone(rules)
  const pairs = reconnectPairRules(rules)
  assert.deepEqual(
    pairs.map((pair) => pair.set),
    ['first', 'middle', 'last']
  )
  assert.deepEqual(pairs[1], { hero: 'example', set: 'middle', dependentSlot: 'misc', requiredSlot: 'back' })
  const merges = wearableMergeRules(rules)
  assert.deepEqual(
    merges.map((merge) => merge.slot),
    ['head', 'misc', 'head']
  )
  assert.deepEqual(merges[0], {
    hero: 'example',
    slot: 'head',
    group: 'example',
    hostSlot: 'back',
    guestStyle: 1,
    bakedGuestSkin: '2',
    preserveGuestVisuals: true
  })
  assert.deepEqual(merges[1].applyTime, rules[1].merges![0].applyTime)
  assert.deepEqual(rules, before)
})

test('body-only rules do not force a companion and absent rules produce no routes', () => {
  const rules: ReconnectRule[] = [{ hero: 'example', slot: 'misc', merges: [{ group: 'example', hostModel: 'body.vmdl', order: 0 }] }]
  assert.deepEqual(reconnectPairRules(rules), [])
  assert.equal(wearableMergeRules(rules).length, 1)
  assert.deepEqual(reconnectPairRules([]), [])
  assert.deepEqual(wearableMergeRules([]), [])
})

test('one hero name supplies both UI companions and canonical schema merge routes', () => {
  const rules: ReconnectRule[] = [
    {
      hero: 'witch doctor',
      slot: 'back',
      companions: [{ set: 'outfit', slot: 'weapon', order: 0 }],
      merges: [{ group: 'witch_doctor', hostSlot: 'weapon', order: 0 }]
    }
  ]
  assert.equal(reconnectPairRules(rules)[0].hero, 'witch doctor')
  assert.equal(wearableMergeRules(rules)[0].hero, 'witch_doctor')
})
