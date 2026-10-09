const path = require('path');

let pkg;
try {
  pkg = require(path.resolve(__dirname, '../../../package.json'));
} catch {
  pkg = {
    productName: 'Dota 2 SkinForge',
    shortName: 'SkinForge',
    modFolder: 'skinforge',
    version: '1.0.0',
    tagline: 'Cosmetic Suite',
    description: 'Local Dota 2 cosmetic suite via VPK modding',
  };
}

const versionParts = (pkg.version || '1.0.0').split('.');
const displayVersion = `v${versionParts[0]}.${versionParts[1] || '0'}`;

const APP_CONFIG = {
  name: pkg.productName || 'Dota 2 SkinForge',
  shortName: pkg.shortName || 'SkinForge',
  modFolder: pkg.modFolder || 'skinforge',
  version: pkg.version || '1.0.0',
  displayVersion: displayVersion,
  tagline: pkg.tagline || 'Cosmetic Suite',
  description: pkg.description || 'Local Dota 2 cosmetic suite via VPK modding',
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { APP_CONFIG };
}
