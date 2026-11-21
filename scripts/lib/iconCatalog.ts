import fs from 'fs'
import path from 'path'
import { collectIconKeys } from '../../src/shared/armory/iconKeys'

export function readIconCatalog(root = process.cwd()): string[] {
  const keys = new Set<string>()
  for (const file of ['heroes_armory.json', 'other_armory.json', 'itemStyles.json']) {
    collectIconKeys(JSON.parse(fs.readFileSync(path.join(root, 'data', file), 'utf8')), keys)
  }
  return [...keys].sort()
}
