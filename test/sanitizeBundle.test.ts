import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyGroupFile, INVISIBLE_BOX_3708_CRC } from '../scripts/sanitize_bundle'

test('classifyGroupFile strips Workshop 3708-byte invisiblebox hijacks and .webm videos while preserving hero defaults and kisilev_ind assets', () => {
  // 1. Panorama webm video -> always drop
  assert.equal(classifyGroupFile('pudge_persona', 'panorama/videos/promo/pudge_cute.webm', 120000, '12345678', false), 'drop')

  // 2. Workshop item path replaced by 3708-byte invisiblebox -> drop
  assert.equal(
    classifyGroupFile(
      'pudge_persona',
      'models/items/pudge/aberrant_observer_belt/aberrant_observer_belt.vmdl_c',
      3708,
      INVISIBLE_BOX_3708_CRC,
      false
    ),
    'drop'
  )

  // 3. Default hero slot path replaced by 3708-byte invisiblebox -> keep (hides unused base slot on persona/arcana)
  assert.equal(classifyGroupFile('pudge_persona', 'models/heroes/pudge/belt.vmdl_c', 3708, INVISIBLE_BOX_3708_CRC, false), 'keep')

  // 4. Workshop item path duplicating the base/default slot model -> drop
  assert.equal(classifyGroupFile('drow', 'models/items/drow/anuxi_wurm_bow/anuxi_wurm_bow.vmdl_c', 1312670, 'abcdef01', true), 'drop')

  // 5. Custom kisilev_ind asset -> keep
  assert.equal(classifyGroupFile('drow', 'kisilev_ind/models/drow/drow_arcana.vmdl_c', 4887956, '99887766', false), 'keep')
})
