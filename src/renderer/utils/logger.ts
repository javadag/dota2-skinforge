import type { PipelineStatus } from '../env'
import { state } from '../state/store'
import { DOM } from './dom'

export type LogType = 'info' | 'warn' | 'error' | 'success'

// Logging Helper
export function log(msg: string, type: LogType = 'info'): void {
  const time = new Date().toLocaleTimeString()
  const line = document.createElement('div')
  line.className = `log-line ${type}`
  line.innerHTML = `<span class="ll-time">[${time}]</span> <span>${msg}</span>`
  if (DOM.logOutput) {
    DOM.logOutput.appendChild(line)
    DOM.logOutput.scrollTop = DOM.logOutput.scrollHeight
  }
  if (DOM.cfStatus) {
    DOM.cfStatus.textContent = msg
  }
}

// Status & Notification Updates
export function updateStatusUI(status?: PipelineStatus | null): void {
  if (!status) return
  state.status = status

  if (DOM.dotaRunningPill) {
    if (status.dotaRunning) {
      DOM.dotaRunningPill.classList.remove('hidden')
      log('Dota 2 process detected active.', 'warn')
    } else {
      DOM.dotaRunningPill.classList.add('hidden')
    }
  }

  if (DOM.statusIndicator) {
    DOM.statusIndicator.className = 'status-indicator'
  }

  if (!status.validDotaDir) {
    DOM.statusIndicator?.classList.add('error')
    if (DOM.statusLabel) DOM.statusLabel.textContent = 'Dota Not Found'
    if (DOM.btnApplyAll) DOM.btnApplyAll.disabled = true
    if (DOM.btnRestore) DOM.btnRestore.disabled = true
    DOM.patchAlert?.classList.add('hidden')
  } else if (status.installed) {
    DOM.statusIndicator?.classList.add('installed')
    if (DOM.statusLabel) DOM.statusLabel.textContent = 'Mods Active'
    if (DOM.btnApplyAll) DOM.btnApplyAll.disabled = false
    if (DOM.btnRestore) DOM.btnRestore.disabled = false
    DOM.patchAlert?.classList.add('hidden')
    localStorage.setItem('skinforge_was_installed', 'true')
  } else {
    DOM.statusIndicator?.classList.add('not-installed')
    if (DOM.statusLabel) DOM.statusLabel.textContent = 'Unmodded'
    if (DOM.btnApplyAll) DOM.btnApplyAll.disabled = false
    if (DOM.btnRestore) DOM.btnRestore.disabled = true

    const wasInstalled = localStorage.getItem('skinforge_was_installed') === 'true'
    if (wasInstalled && state.settings.autoDetect) {
      DOM.patchAlert?.classList.remove('hidden')
      log('Steam game update reset detected. One-click re-apply ready.', 'warn')
    } else {
      DOM.patchAlert?.classList.add('hidden')
    }
  }

  if (state.dotaPath) {
    if (DOM.dotaPathSidebar) {
      DOM.dotaPathSidebar.textContent = state.dotaPath
      DOM.dotaPathSidebar.title = state.dotaPath
    }
    if (DOM.settingsDotaPath) {
      DOM.settingsDotaPath.textContent = state.dotaPath
    }
  }
}
