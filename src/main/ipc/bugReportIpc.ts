/**
 * Bug Report Domain IPC Handlers
 */

import { app, BrowserWindow, dialog, ipcMain, nativeImage } from 'electron'
import type { BugReportDiagnostics, BugReportResult } from '../../shared/utils/bugReport'
import { APP_CONFIG } from '../../shared/constants/appConfig'
import { IPC_CHANNELS } from '../../shared/types/ipc'
import { getBugReportStatePath, getRuntimeAppVersion } from '../services/app/appPaths'
import {
  collectDiagnostics,
  commentOnBugReport,
  encodeBugScreenshot,
  getCapturedErrors,
  getInstallId,
  listBugReports,
  submitBugReport,
  type CommentInput,
  type SubmitInput
} from '../services/app/bugReportService'

interface ContextInput {
  activeTab?: string
  dotaFound?: boolean
  modsInstalled?: boolean
}

export function registerBugReportIpc(getMainWindow: () => BrowserWindow | null) {
  const stateFile = getBugReportStatePath()

  ipcMain.handle(IPC_CHANNELS.bugReportContext, (_event, input?: ContextInput) => {
    const diagnostics: BugReportDiagnostics = collectDiagnostics({
      appName: APP_CONFIG.name,
      appVersion: getRuntimeAppVersion(),
      packaged: app.isPackaged,
      locale: app.getLocale(),
      activeTab: input?.activeTab,
      dotaFound: input?.dotaFound,
      modsInstalled: input?.modsInstalled
    })
    return { diagnostics, errors: getCapturedErrors(), configured: Boolean(APP_CONFIG.bugReportUrl) }
  })

  ipcMain.handle(IPC_CHANNELS.bugReportCaptureScreenshot, async () => {
    const win = getMainWindow()
    if (!win || win.isDestroyed()) return { ok: false, error: 'No window to capture.' }
    try {
      const encoded = encodeBugScreenshot(await win.webContents.capturePage())
      return encoded ? { ok: true, ...encoded } : { ok: false, error: 'Could not capture the window.' }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle(IPC_CHANNELS.bugReportPickScreenshot, async () => {
    const win = getMainWindow()
    const options: Electron.OpenDialogOptions = {
      title: 'Attach a screenshot',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }]
    }
    const res = win && !win.isDestroyed() ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (res.canceled || res.filePaths.length === 0) return { ok: false, canceled: true }
    const encoded = encodeBugScreenshot(nativeImage.createFromPath(res.filePaths[0]))
    return encoded ? { ok: true, ...encoded } : { ok: false, error: 'That file is not a usable image or is too large.' }
  })

  ipcMain.handle(IPC_CHANNELS.bugReportSubmit, async (_event, input: SubmitInput): Promise<BugReportResult> => {
    try {
      return await submitBugReport(input, { endpoint: APP_CONFIG.bugReportUrl, stateFile })
    } catch (e) {
      console.error('[BugReport] unexpected failure', e)
      return { ok: false, code: 'server', error: 'Something went wrong while sending the report.' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.bugReportList, async () => {
    try {
      return await listBugReports({ endpoint: APP_CONFIG.bugReportUrl, stateFile })
    } catch (e) {
      console.error('[BugReport] list failure', e)
      return { ok: false, reports: [], error: 'Could not load your reports.' }
    }
  })

  ipcMain.handle(IPC_CHANNELS.bugReportComment, async (_event, input: CommentInput) => {
    try {
      return await commentOnBugReport(input, { endpoint: APP_CONFIG.bugReportUrl, stateFile })
    } catch (e) {
      console.error('[BugReport] comment failure', e)
      return { ok: false, error: 'Something went wrong while posting your update.' }
    }
  })

  try {
    getInstallId(stateFile)
  } catch {
    // Non-fatal; submit recreates it.
  }
}
