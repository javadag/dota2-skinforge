const assert = require('assert');
const fs = require('fs');
const path = require('path');

const catalogPath = path.resolve(__dirname, '../data/valveHeroCatalog.json');
assert.strictEqual(fs.existsSync(catalogPath), true, 'valveHeroCatalog.json must exist in data/');

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
assert.ok(catalog.pudge, 'Pudge catalog entry must exist');
assert.ok(Array.isArray(catalog.pudge.slots), 'Pudge slots must be an array');
assert.ok(catalog.pudge.items, 'Pudge items must exist');

// Verify that the redundant 2.35MB JS catalog is removed
const redundantJsCatalog = path.resolve(__dirname, '../src/data/valveHeroCatalog.js');
assert.strictEqual(fs.existsSync(redundantJsCatalog), false, 'Redundant valveHeroCatalog.js must be removed');

console.log('Catalog data integrity test passed!');
