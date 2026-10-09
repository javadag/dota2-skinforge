/**
 * Steam Library & Dota 2 Installation Path Detection Service
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getSteamPathFromRegistry() {
  try {
    const output = execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', { encoding: 'utf-8' });
    const match = output.match(/SteamPath\s+REG_SZ\s+(.+)/i);
    if (match && match[1]) {
      return match[1].trim().replace(/\//g, '\\');
    }
  } catch (err) {
    // Registry query failed or not on Windows
  }
  return null;
}

function parseLibraryFolders(vdfContent) {
  const libraries = [];
  const pathRegex = /"path"\s+"([^"]+)"/g;
  let match;
  while ((match = pathRegex.exec(vdfContent)) !== null) {
    let libPath = match[1].replace(/\\\\/g, '\\');
    libraries.push(libPath);
  }
  return libraries;
}

function isValidDotaGameDir(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return false;
  const gameinfo = path.join(dirPath, 'dota', 'gameinfo.gi');
  const dotaDir = path.join(dirPath, 'dota');
  return fs.existsSync(dotaDir) && fs.existsSync(gameinfo);
}

function detectDotaPath() {
  const steamPath = getSteamPathFromRegistry() || 'C:\\Program Files (x86)\\Steam';
  const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');

  const candidates = [];

  if (fs.existsSync(vdfPath)) {
    try {
      const content = fs.readFileSync(vdfPath, 'utf-8');
      const libs = parseLibraryFolders(content);
      for (const lib of libs) {
        const potential = path.join(lib, 'steamapps', 'common', 'dota 2 beta', 'game');
        candidates.push(potential);
      }
    } catch (e) {
      // Ignore VDF read error
    }
  }

  // Common fallback drive paths
  const driveLetters = ['C', 'D', 'E', 'F', 'G'];
  for (const drive of driveLetters) {
    candidates.push(`${drive}:\\SteamLibrary\\steamapps\\common\\dota 2 beta\\game`);
    candidates.push(`${drive}:\\Program Files (x86)\\Steam\\steamapps\\common\\dota 2 beta\\game`);
    candidates.push(`${drive}:\\Steam\\steamapps\\common\\dota 2 beta\\game`);
  }

  for (const cand of candidates) {
    if (isValidDotaGameDir(cand)) {
      return path.resolve(cand);
    }
  }

  return null;
}

module.exports = {
  detectDotaPath,
  isValidDotaGameDir
};
