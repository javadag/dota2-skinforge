import React, { useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { Button } from './ui/Button'
import { ArrowDownToLine, CheckCircle2, ExternalLink, RefreshCw, Sparkles, X } from 'lucide-react'

export const UpdateModal: React.FC = () => {
  const isUpdateModalOpen = useAppStore((s) => s.isUpdateModalOpen)
  const setUpdateModalOpen = useAppStore((s) => s.setUpdateModalOpen)
  const updateInfo = useAppStore((s) => s.updateInfo)
  const updateStatus = useAppStore((s) => s.updateStatus)
  const updateProgress = useAppStore((s) => s.updateProgress)
  const downloadUpdate = useAppStore((s) => s.downloadUpdate)
  const installUpdate = useAppStore((s) => s.installUpdate)

  const [selectedFormat, setSelectedFormat] = useState<'portable' | 'installer'>('portable')

  if (!isUpdateModalOpen || !updateInfo) {
    return <div id="updateModal" className="hidden" />
  }

  const portableAsset = updateInfo.portableAsset
  const installerAsset = updateInfo.installerAsset
  const chosenAsset = selectedFormat === 'portable' ? (portableAsset || updateInfo.assets?.[0]) : (installerAsset || updateInfo.assets?.[0])

  const formatSize = (bytes?: number) => {
    if (!bytes) return ''
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const handleStartDownload = () => {
    if (!chosenAsset) return
    downloadUpdate(chosenAsset.browser_download_url, chosenAsset.name)
  }

  const handleOpenGitHub = () => {
    if (updateInfo.htmlUrl && window.skinforge?.openExternal) {
      window.skinforge.openExternal(updateInfo.htmlUrl)
    }
  }

  return (
    <div
      id="updateModal"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && updateStatus !== 'downloading') {
          setUpdateModalOpen(false)
        }
      }}
    >
      <div className="w-full max-w-lg bg-bg-surface border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-5 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Sparkles className="size-4.5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Update Available
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-semibold font-mono">
                  {updateInfo.displayVersion}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Current version: {updateInfo.currentVersion || 'Installed'}
              </p>
            </div>
          </div>
          <button
            id="updateModalClose"
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
            onClick={() => setUpdateModalOpen(false)}
            disabled={updateStatus === 'downloading'}
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Release Notes */}
        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>Release Notes</span>
            <button
              onClick={handleOpenGitHub}
              className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 cursor-pointer"
            >
              View on GitHub <ExternalLink className="size-3" />
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto rounded-xl bg-black/40 border border-white/5 p-3.5 text-xs text-slate-300 font-sans leading-relaxed whitespace-pre-wrap select-text">
            {updateInfo.releaseNotes || 'No release notes provided.'}
          </div>
        </div>

        {/* Package Type Selector (if idle or error) */}
        {updateStatus !== 'downloading' && updateStatus !== 'downloaded' && (
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold text-slate-300">Choose Download Format</div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setSelectedFormat('portable')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedFormat === 'portable'
                    ? 'bg-purple-500/15 border-purple-500/50 text-white shadow-lg shadow-purple-500/10'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
                }`}
              >
                <div className="text-xs font-bold text-white">Portable Executable</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Single .exe, no installation {portableAsset ? `(${formatSize(portableAsset.size)})` : ''}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedFormat('installer')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedFormat === 'installer'
                    ? 'bg-purple-500/15 border-purple-500/50 text-white shadow-lg shadow-purple-500/10'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200'
                }`}
              >
                <div className="text-xs font-bold text-white">Windows Installer</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Setup .exe with shortcuts {installerAsset ? `(${formatSize(installerAsset.size)})` : ''}
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Downloading Progress Bar */}
        {updateStatus === 'downloading' && (
          <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white flex items-center gap-2">
                <RefreshCw className="size-3.5 animate-spin text-purple-400" />
                Downloading update...
              </span>
              <span className="font-mono text-purple-300 font-bold">
                {updateProgress ? `${updateProgress.percent}%` : 'Starting...'}
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-black/50 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-indigo-400 transition-all duration-200"
                style={{ width: `${updateProgress?.percent || 0}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>
                {updateProgress
                  ? `${(updateProgress.bytesReceived / (1024 * 1024)).toFixed(1)} / ${(updateProgress.totalBytes / (1024 * 1024)).toFixed(1)} MB`
                  : 'Connecting...'}
              </span>
              <span>
                {updateProgress && updateProgress.speedBytesPerSec > 0
                  ? `${(updateProgress.speedBytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
                  : ''}
              </span>
            </div>
          </div>
        )}

        {/* Downloaded Ready to Install */}
        {updateStatus === 'downloaded' && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
            <CheckCircle2 className="size-6 text-emerald-400 shrink-0" />
            <div>
              <div className="text-xs font-bold text-emerald-300">Update downloaded successfully!</div>
              <div className="text-[11px] text-emerald-200/70 mt-0.5">
                Click below to launch the new version and close the current app.
              </div>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {updateStatus === 'error' && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
            Failed to download update automatically. You can download it directly from GitHub Releases.
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {updateStatus !== 'downloading' && (
            <Button
              id="btnUpdateLater"
              variant="ghost"
              onClick={() => setUpdateModalOpen(false)}
            >
              Later
            </Button>
          )}

          {updateStatus !== 'downloading' && updateStatus !== 'downloaded' && (
            <Button
              id="btnStartUpdateDownload"
              variant="primary"
              onClick={handleStartDownload}
              disabled={!chosenAsset}
            >
              <ArrowDownToLine className="size-4 mr-1.5" />
              Download & Update
            </Button>
          )}

          {updateStatus === 'downloaded' && (
            <Button
              id="btnInstallUpdateNow"
              variant="primary"
              onClick={installUpdate}
            >
              <RefreshCw className="size-4 mr-1.5" />
              Install & Restart Now
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
