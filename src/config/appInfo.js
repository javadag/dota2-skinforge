const path = require('path');
const pkg = require(path.join(__dirname, '../../package.json'));

const versionParts = (pkg.version || '1.0.0').split('.');
const displayVersion = `v${versionParts[0]}.${versionParts[1] || '0'}`;

const appInfo = {
  name: pkg.productName || 'Dota 2 SkinForge',
  shortName: pkg.shortName || 'SkinForge',
  modFolder: pkg.modFolder || 'skinforge',
  version: pkg.version || '1.0.0',
  displayVersion: displayVersion,
  tagline: pkg.tagline || 'Cosmetic Suite',
  description: pkg.description || 'Local Dota 2 cosmetic suite via VPK modding'
};

module.exports = appInfo;
