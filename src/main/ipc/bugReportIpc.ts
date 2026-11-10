/**
 * Bug Report Domain IPC Handlers
 */

import { app, BrowserWindow, dialog, ipcMain, nativeImage, type NativeImage } from 'electron'
import path from 'path'
import { APP_CONFIG } from '../../shared/constants/appConfig'
import { BUG_REPORT_LIMITS, type BugReportResult, type BugReportDiagnostics } from '../../shared/bugReport'
import { collectDiagnostics, getCapturedErrors, getInstallId, submitBugReport, type SubmitInput } from '../services/bugReportService'

const MAX_IMAGE_WIDTH = 1600

interface ContextInput {
  activeTab?: string
  dotaFound?: boolean
  modsInstalled?: boolean
}

interface EncodedImage {
  mime: 'image/png' | 'image/jpeg'
  dataBase64: string
  sizeBytes: number
}

function stateFile(): string {
  return path.join(app.getPath('userData'), 'bug_report_state.json')
}

/** Downscale and encode below the size limit. Re-encoding also strips EXIF/location metadata. */
function encodeImage(image: NativeImage): EncodedImage | null {
  if (image.isEmpty()) return null
  let img = image
  const { width } = img.getSize()
  if (width > MAX_IMAGE_WIDTH) img = img.resize({ width: MAX_IMAGE_WIDTH, quality: 'best' })

  const png = img.toPNG()
  if (png.length <= BUG_REPORT_LIMITS.screenshotMaxBytes) {
    return { mime: 'image/png', dataBase64: png.toString('base64'), sizeBytes: png.length }
  }
  for (const quality of [85, 70, 50]) {
    const jpg = img.toJPEG(quality)
    if (jpg.length <= BUG_REPORT_LIMITS.screenshotMaxBytes) {
      return { mime: 'image/jpeg', dataBase64: jpg.toString('base64'), sizeBytes: jpg.length }
    }
  }
  return null
}

export function registerBugReportIpc(getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('bug-report:context', (_event, input?: ContextInput) => {
    const diagnostics: BugReportDiagnostics = collectDiagnostics({
      appName: APP_CONFIG.name,
      appVersion: (typeof app?.getVersion === 'function' && app.getVersion()) || APP_CONFIG.version,
      packaged: app.isPackaged,
      locale: app.getLocale(),
      activeTab: input?.activeTab,
      dotaFound: input?.dotaFound,
      modsInstalled: input?.modsInstalled
    })
    return { diagnostics, errors: getCapturedErrors(), configured: Boolean(APP_CONFIG.bugReportUrl) }
  })

  ipcMain.handle('bug-report:capture', async () => {
    const win = getMainWindow()
    if (!win || win.isDestroyed()) return { ok: false, error: 'No window to capture.' }
    try {
      const encoded = encodeImage(await win.webContents.capturePage())
      return encoded ? { ok: true, ...encoded } : { ok: false, error: 'Could not capture the window.' }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('bug-report:pick-image', async () => {
    const win = getMainWindow()
    const options: Electron.OpenDialogOptions = {
      title: 'Attach a screenshot',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }]
    }
    const res = win && !win.isDestroyed() ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (res.canceled || res.filePaths.length === 0) return { ok: false, canceled: true }
    const encoded = encodeImage(nativeImage.createFromPath(res.filePaths[0]))
    return encoded ? { ok: true, ...encoded } : { ok: false, error: 'That file is not a usable image or is too large.' }
  })

  ipcMain.handle('bug-report:submit', async (_event, input: SubmitInput): Promise<BugReportResult> => {
    try {
      return await submitBugReport(input, { endpoint: APP_CONFIG.bugReportUrl, stateFile: stateFile() })
    } catch (e) {
      console.error('[BugReport] unexpected failure', e)
      return { ok: false, code: 'server', error: 'Something went wrong while sending the report.' }
    }
  })

  // Touch the install id early so it is stable and persisted before the first submit.
  try {
    getInstallId(stateFile())
  } catch {
    // Non-fatal; submit recreates it.
  }
}
