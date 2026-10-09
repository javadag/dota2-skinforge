/**
 * High-Level Mod Pipeline Orchestrator Service
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const vpk = require('./vpkService');
const gameinfo = require('./gameinfoService');
const signatures = require('./signatureService');
const itemModifier = require('./modifier');
const { APP_CONFIG } = require('../../shared/constants/appConfig');

const MOD_FOLDER_NAME = APP_CONFIG.modFolder || 'skinforge';

function isDotaRunning() {
  try {
    const output = execSync('tasklist /FI "IMAGENAME eq dota2.exe" /NH', { encoding: 'utf-8' });
    return output.toLowerCase().includes('dota2.exe');
  } catch (e) {
    return false;
  }
}

function getBackupDir(dotaGameDir) {
  return path.join(dotaGameDir, `${MOD_FOLDER_NAME}.backup`);
}

function checkStatus(dotaGameDir) {
  if (!dotaGameDir || !fs.existsSync(dotaGameDir)) {
    return {
      validDotaDir: false,
      dotaRunning: false,
      installed: false,
      signaturesBypassed: false,
      gameinfoConfigured: false,
    };
  }

  const dotaRunning = isDotaRunning();
  const vpkDir = path.join(dotaGameDir, MOD_FOLDER_NAME);
  const vpkFile = path.join(vpkDir, 'pak01_dir.vpk');
  const legacyVpk = path.join(dotaGameDir, 'pak01_dir.vpk');
  const hasVpk = fs.existsSync(vpkFile) || fs.existsSync(legacyVpk);

  const giPath = gameinfo.getGameinfoPath(dotaGameDir);
  let gameinfoConfigured = false;
  if (fs.existsSync(giPath)) {
    const giContent = fs.readFileSync(giPath, 'utf-8');
    gameinfoConfigured = giContent.includes(MOD_FOLDER_NAME);
  }

  const sigPath = signatures.getSignaturesPath(dotaGameDir);
  let signaturesBypassed = false;
  if (fs.existsSync(sigPath) && fs.existsSync(giPath)) {
    const sigContent = fs.readFileSync(sigPath, 'utf-8');
    const giBuffer = fs.readFileSync(giPath);
    const sha1 = crypto.createHash('sha1').update(giBuffer).digest('hex').toUpperCase();
    signaturesBypassed = sigContent.includes(sha1);
  }

  const installed = hasVpk && gameinfoConfigured && signaturesBypassed;

  return {
    validDotaDir: true,
    dotaRunning,
    installed,
    signaturesBypassed,
    gameinfoConfigured,
    vpkFileExists: hasVpk,
  };
}

async function installMods(dotaGameDir, equipped = {}, onProgress = () => {}) {
  if (!dotaGameDir || !fs.existsSync(dotaGameDir)) {
    throw new Error('Invalid Dota 2 game directory.');
  }

  if (isDotaRunning()) {
    throw new Error('Dota 2 is currently running. Please close Dota 2 before installing mods.');
  }

  const backupDir = getBackupDir(dotaGameDir);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  onProgress({ step: 1, total: 5, message: 'Injecting search paths into gameinfo...' });
  gameinfo.injectSearchPaths(dotaGameDir, MOD_FOLDER_NAME, backupDir);

  onProgress({
    step: 2,
    total: 5,
    message: 'Updating file integrity signatures (dota.signatures)...',
  });
  signatures.updateSignaturesForGameinfo(dotaGameDir, backupDir);

  const stagingDir = path.resolve(__dirname, '../../../.staging_pack');

  onProgress({ step: 3, total: 5, message: 'Generating mod assets and tailoring items schema...' });
  const modResult = await itemModifier.generateModPackage(
    dotaGameDir,
    stagingDir,
    equipped,
    onProgress,
    vpk
  );

  onProgress({
    step: 4,
    total: 5,
    message: 'Packing mod assets into multi-chunk VPK (pak01_dir & pak01_000)...',
  });
  const targetModDir = path.join(dotaGameDir, MOD_FOLDER_NAME);
  if (!fs.existsSync(targetModDir)) {
    fs.mkdirSync(targetModDir, { recursive: true });
  }
  const targetVpk = path.join(targetModDir, 'pak01_dir.vpk');

  await vpk.pack(stagingDir, targetVpk);

  // Clean staging directory
  try {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  } catch (e) {}

  onProgress({
    step: 5,
    total: 5,
    message: `Installation complete! (${modResult.patchedCount} cosmetics active)`,
  });
  return { success: true, patchedCount: modResult.patchedCount };
}

function uninstallMods(dotaGameDir, onProgress = () => {}) {
  if (!dotaGameDir || !fs.existsSync(dotaGameDir)) {
    throw new Error('Invalid Dota 2 game directory.');
  }

  if (isDotaRunning()) {
    throw new Error('Dota 2 is currently running. Please close Dota 2 before uninstalling mods.');
  }

  const backupDir = getBackupDir(dotaGameDir);

  onProgress({ step: 1, total: 3, message: 'Restoring gameinfo search paths...' });
  gameinfo.restoreCleanGameinfo(dotaGameDir, backupDir);

  onProgress({ step: 2, total: 3, message: 'Restoring signature verification...' });
  signatures.restoreSignatures(dotaGameDir, backupDir);

  onProgress({ step: 3, total: 3, message: 'Removing mod VPK folder...' });
  const targetModDir = path.join(dotaGameDir, MOD_FOLDER_NAME);
  if (fs.existsSync(targetModDir)) {
    fs.rmSync(targetModDir, { recursive: true, force: true });
  }

  return { success: true };
}

module.exports = {
  checkStatus,
  installMods,
  uninstallMods,
  isDotaRunning,
  MOD_FOLDER_NAME,
};
