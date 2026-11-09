const fs = require('fs')
const data = JSON.parse(fs.readFileSync('data/hero_sets.json', 'utf8'))
// Check if data is keyed by hero
if (data.legion_commander) {
  console.log('LC sets by key:')
  for (const s of data.legion_commander) {
    console.log(`Set: "${s.name}" (id: ${s.id})`)
    for (const item of s.items) {
      console.log(`   slot: ${item.slot}, name: ${item.name}`)
    }
  }
} else {
  console.log('Keys of data:', Object.keys(data).slice(0, 10))
}
