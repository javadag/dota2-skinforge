const assert = require('assert')
const {
  parseVdf,
  materialize,
  materializeDeep,
  getString,
  getNode,
  findAll,
  cloneNode,
  setString,
  removeKey,
  serializeValue,
  applySplices,
  spliceNode,
  detectEol,
  escapeToken,
  VdfParseError
} = require('../src/main/services/modifier/vdf')

// --- basic document ---------------------------------------------------------
const doc = parseVdf('"items_game"\n{\n\t"items"\n\t{\n\t\t"1"\n\t\t{\n\t\t\t"name"\t\t"Axe"\n\t\t}\n\t}\n}\n')
assert.strictEqual(doc.key, 'items_game')
const items = getNode(doc.root, 'items')
assert.strictEqual(items.entries.length, 1)
assert.strictEqual(getString(items.entries[0].value, 'name'), 'Axe')
console.log('✔ vdf: parses a document and reads scalars')

// --- repeated keys are preserved (visuals holds many asset_modifier blocks) ---
const repeated = parseVdf(
  '"d"\n{\n\t"visuals"\n\t{\n\t\t"asset_modifier"\n\t\t{\n\t\t\t"type"\t\t"a"\n\t\t}\n\t\t"asset_modifier"\n\t\t{\n\t\t\t"type"\t\t"b"\n\t\t}\n\t\t"asset_modifier0"\n\t\t{\n\t\t\t"type"\t\t"c"\n\t\t}\n\t}\n}\n'
)
const visuals = getNode(repeated.root, 'visuals')
assert.strictEqual(visuals.entries.length, 3, 'repeated keys must all be kept')
assert.strictEqual(findAll(visuals, 'asset_modifier').length, 2)
console.log('✔ vdf: keeps repeated keys instead of collapsing them')

// --- escaped quotes and BOM -------------------------------------------------
const escaped = parseVdf('\uFEFF"d"\n{\n\t"name"\t\t"Lima \\"Killer\\""\n}\n')
assert.strictEqual(getString(escaped.root, 'name'), 'Lima "Killer"')
assert.strictEqual(escapeToken('Lima "Killer"'), '"Lima \\"Killer\\""')
console.log('✔ vdf: handles a UTF-8 BOM and escaped quotes')

// --- comments ---------------------------------------------------------------
const commented = parseVdf('"d"\n{\n\t// a comment\n\t"a"\t\t"1"\n\t/* block */\n\t"b"\t\t"2"\n}\n')
assert.strictEqual(commented.root.entries.length, 2)
console.log('✔ vdf: skips line and block comments')

// --- opaque blocks are skipped then materialized on demand ------------------
const big =
  '"d"\n{\n\t"items"\n\t{\n\t\t"9"\n\t\t{\n\t\t\t"name"\t\t"X"\n\t\t\t"visuals"\n\t\t\t{\n\t\t\t\t"asset_modifier"\n\t\t\t\t{\n\t\t\t\t\t"type"\t\t"entity_model"\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n}\n'
const lazy = parseVdf(big, { opaque: (key) => key.toLowerCase() === 'visuals' })
const lazyItem = getNode(lazy.root, 'items').entries[0].value
const lazyVisuals = getNode(lazyItem, 'visuals')
assert.strictEqual(lazyVisuals.opaque, true)
assert.strictEqual(findAll(lazyVisuals, 'asset_modifier').length, 0, 'opaque blocks read as empty')
materialize(big, lazyVisuals)
assert.strictEqual(findAll(lazyVisuals, 'asset_modifier').length, 1, 'materialize fills the block in')
console.log('✔ vdf: opaque spans stay cheap and materialize correctly')

// --- serialization round-trip ----------------------------------------------
const eol = detectEol(big)
materializeDeep(big, lazyItem)
const text = serializeValue(lazyItem, 2, eol)
const round = parseVdf(`"d"\n{\n\t"9"\n${text}\n}\n`)
const roundItem = round.root.entries[0].value
const shape = (n) => n.entries.map((e) => (typeof e.value === 'object' ? `${e.key}{${shape(e.value)}}` : `${e.key}=${e.value}`)).join('|')
assert.strictEqual(shape(roundItem), shape(lazyItem), 'serialize -> parse must be lossless')
assert.strictEqual(serializeValue(roundItem, 2, eol), text, 'serialization must be stable')
console.log('✔ vdf: serialize -> parse round-trips losslessly')

// --- serializing an unmaterialized node must fail loudly, not emit "{}" -----
const stillLazy = parseVdf(big, { opaque: (key) => key.toLowerCase() === 'visuals' })
const lazyAgain = getNode(getNode(stillLazy.root, 'items').entries[0].value, 'visuals')
assert.throws(() => serializeValue(lazyAgain, 2, eol), /opaque/i)
console.log('✔ vdf: refuses to serialize an unmaterialized block')

// --- splice application is single-pass and order-independent ---------------
const spliced = applySplices('abcdef', [
  { start: 4, end: 6, text: 'EF' },
  { start: 0, end: 1, text: 'A' }
])
assert.strictEqual(spliced, 'AbcdEF')
assert.throws(
  () =>
    applySplices('abcdef', [
      { start: 0, end: 3, text: 'x' },
      { start: 2, end: 4, text: 'y' }
    ]),
  /Overlapping/
)
console.log('✔ vdf: applies splices in one pass and rejects overlaps')

// --- mutation helpers -------------------------------------------------------
const mutable = cloneNode(lazyItem)
setString(mutable, 'name', 'Y')
assert.strictEqual(getString(mutable, 'name'), 'Y')
removeKey(mutable, 'visuals')
assert.strictEqual(getNode(mutable, 'visuals'), undefined)
assert.strictEqual(getString(lazyItem, 'name'), 'X', 'cloneNode must not alias the source')
console.log('✔ vdf: mutation helpers work on clones without touching the source')

// --- malformed input is rejected -------------------------------------------
assert.throws(() => parseVdf('"d"\n{\n\t"a"\t\t"1"\n'), VdfParseError)
assert.throws(() => parseVdf('"d"\n{\n\t"a"\n\t{\n'), VdfParseError)
assert.throws(() => parseVdf('"d"\n{\n}\ntrailing'), VdfParseError)
console.log('✔ vdf: rejects unterminated and trailing content')

// --- spliceNode rewrites a node over its recorded span ---------------------
const spanSource = '"items_game"\r\n{\r\n\t"items"\r\n\t{\r\n\t\t"1"\r\n\t\t{\r\n\t\t\t"name"\t\t"Axe"\r\n\t\t}\r\n\t}\r\n}\r\n'
const spanDoc = parseVdf(spanSource)
const spanItem = getNode(spanDoc.root, 'items').entries[0].value
const edited = cloneNode(spanItem)
setString(edited, 'name', 'Axe Renamed')
const spanOut = applySplices(spanSource, [spliceNode(edited, '\r\n', 2)])
assert.ok(spanOut.startsWith(spanSource.slice(0, spanItem.start)), 'bytes before the node are untouched')
assert.ok(spanOut.endsWith('\r\n\t}\r\n}\r\n'), 'bytes after the node are untouched')
assert.strictEqual(getString(getNode(parseVdf(spanOut).root, 'items').entries[0].value, 'name'), 'Axe Renamed')
console.log('✔ vdf: spliceNode rewrites a node over its recorded span')

console.log('✔ all VDF parser tests passed')
