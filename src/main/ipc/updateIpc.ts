/**
 * Update Domain IPC Handlers
 */

import { BrowserWindow, ipcMain } from 'electron'
import { APP_CONFIG } from '../../shared/constants/appConfig'
import { IPC_CHANNELS } from '../../shared/types/ipc'
import { getRuntimeAppVersion } from '../services/app/appPaths'
import { checkForUpdates, downloadUpdate, getReleaseNotesForVersion, installUpdate } from '../services/app/updateService'

export function registerUpdateIpc(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle(IPC_CHANNELS.updateCheck, async () => {
    try {
      return await checkForUpdates(getRuntimeAppVersion())
    } catch (e: unknown) {
      return { updateAvailable: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.updateGetReleaseNotes, async (_event, version: string) => {
    const requestedVersion = version || getRuntimeAppVersion()
    try {
      return await getReleaseNotesForVersion(requestedVersion)
    } catch (e: unknown) {
      const releaseVersion = String(requestedVersion).replace(/^v/i, '')
      return {
        version: releaseVersion,
        releaseNotes: '',
        publishedAt: '',
        htmlUrl: `https://github.com/${APP_CONFIG.githubRepo}/releases/tag/v${encodeURIComponent(releaseVersion)}`,
        error: e instanceof Error ? e.message : String(e)
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.updateDownload, async (_event, payload: { assetUrl: string; filename: string; expectedSha256?: string }) => {
    if (!payload || typeof payload.assetUrl !== 'string' || typeof payload.filename !== 'string') {
      return { ok: false, error: 'Invalid update download payload.' }
    }
    return await downloadUpdate(
      payload.assetUrl,
      payload.filename,
      (progress) => {
        const mainWindow = getMainWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.updateDownloadProgress, progress)
        }
      },
      payload.expectedSha256,
      { requireVerifiedRelease: true }
    )
  })

  ipcMain.handle(IPC_CHANNELS.updateInstall, async (_event, payload: { filePath: string; expectedSha256?: string }) => {
    if (!payload || typeof payload.filePath !== 'string') {
      return { ok: false, error: 'Invalid update install payload.' }
    }
    return await installUpdate(payload.filePath, payload.expectedSha256, { requireVerifiedRelease: true })
  })
}
