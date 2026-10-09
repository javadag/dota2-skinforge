import { DOM } from './dom.js';
import { state } from '../state/store.js';

// Logging Helper
export function log(msg, type = 'info') {
  const time = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.innerHTML = `<span class="ll-time">[${time}]</span> <span>${msg}</span>`;
  if (DOM.logOutput) {
    DOM.logOutput.appendChild(line);
    DOM.logOutput.scrollTop = DOM.logOutput.scrollHeight;
  }
  if (DOM.cfStatus) {
    DOM.cfStatus.textContent = msg;
  }
}

// Status & Notification Updates
export function updateStatusUI(status) {
  if (!status) return;
  state.status = status;

  if (status.dotaRunning) {
    DOM.dotaRunningPill.classList.remove('hidden');
    log('Dota 2 process detected active.', 'warn');
  } else {
    DOM.dotaRunningPill.classList.add('hidden');
  }

  DOM.statusIndicator.className = 'status-indicator';

  if (!status.validDotaDir) {
    DOM.statusIndicator.classList.add('error');
    DOM.statusLabel.textContent = 'Dota Not Found';
    DOM.btnApplyAll.disabled = true;
    DOM.btnRestore.disabled = true;
    DOM.patchAlert.classList.add('hidden');
  } else if (status.installed) {
    DOM.statusIndicator.classList.add('installed');
    DOM.statusLabel.textContent = 'Mods Active';
    DOM.btnApplyAll.disabled = false;
    DOM.btnRestore.disabled = false;
    DOM.patchAlert.classList.add('hidden');
    localStorage.setItem('skinforge_was_installed', 'true');
  } else {
    DOM.statusIndicator.classList.add('not-installed');
    DOM.statusLabel.textContent = 'Unmodded';
    DOM.btnApplyAll.disabled = false;
    DOM.btnRestore.disabled = true;

    const wasInstalled = localStorage.getItem('skinforge_was_installed') === 'true';
    if (wasInstalled && state.settings.autoDetect) {
      DOM.patchAlert.classList.remove('hidden');
      log('Steam game update reset detected. One-click re-apply ready.', 'warn');
    } else {
      DOM.patchAlert.classList.add('hidden');
    }
  }

  if (state.dotaPath) {
    DOM.dotaPathSidebar.textContent = state.dotaPath;
    DOM.dotaPathSidebar.title = state.dotaPath;
    DOM.settingsDotaPath.textContent = state.dotaPath;
  }
}
