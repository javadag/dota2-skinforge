import { Bug, CheckCircle2, ExternalLink, ImagePlus, Loader2, Monitor, Trash2, X } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BUG_REPORT_LIMITS, redactSensitive, type BugReportDiagnostics } from '../../shared/bugReport'
import { useAppStore } from '../state/useAppStore'
import { Button } from './ui/Button'

type Phase = 'editing' | 'sending' | 'sent' | 'duplicate'

interface Screenshot {
  mime: 'image/png' | 'image/jpeg'
  dataBase64: string
  sizeBytes: number
}

const FIELD =
  'w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[13px] text-white placeholder:text-slate-500 outline-none focus:border-purple-500/60 select-text'

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

export const BugReportModal: React.FC = () => {
  const isOpen = useAppStore((s) => s.isBugReportOpen)
  const setOpen = useAppStore((s) => s.setBugReportOpen)

  const overlayRef = useRef<HTMLDivElement>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [steps, setSteps] = useState('')
  const [includeLogs, setIncludeLogs] = useState(true)
  const [showPreview, setShowPreview] = useState(false)
  const [screenshot, setScreenshot] = useState<Screenshot | null>(null)
  const [phase, setPhase] = useState<Phase>('editing')
  const [error, setError] = useState<string | null>(null)
  const [issueUrl, setIssueUrl] = useState<string | undefined>()
  const [context, setContext] = useState<{ diagnostics: BugReportDiagnostics; errors: string; configured: boolean } | null>(null)
  const [busyImage, setBusyImage] = useState(false)

  const logs = useAppStore((s) => s.logs)
  const activeTab = useAppStore((s) => s.activeTab)
  const status = useAppStore((s) => s.status)

  const logText = useMemo(
    () =>
      redactSensitive(
        logs
          .slice(-BUG_REPORT_LIMITS.logsMaxLines)
          .map((l) => `[${l.time}] [${l.type}] ${l.message}`)
          .join('\n')
      ),
    [logs]
  )

  const close = useCallback(() => {
    if (phase === 'sending') return
    setOpen(false)
  }, [phase, setOpen])

  // Load diagnostics each time the dialog opens; start a fresh form after a completed submit.
  useEffect(() => {
    if (!isOpen) return
    if (phase === 'sent' || phase === 'duplicate') {
      setTitle('')
      setDescription('')
      setSteps('')
      setScreenshot(null)
      setPhase('editing')
      setIssueUrl(undefined)
    }
    setError(null)
    window.skinforge
      .getBugReportContext({
        activeTab,
        dotaFound: status?.validDotaDir,
        modsInstalled: status?.installed
      })
      .then(setContext)
      .catch(() => setContext(null))
    // Only on open; the form must not reset while the user is typing.
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, close])

  if (!isOpen) return <div id="bugReportModal" className="hidden" />

  const configured = context?.configured ?? true
  const canSubmit = phase === 'editing' && configured && title.trim().length >= BUG_REPORT_LIMITS.titleMin && description.trim().length >= BUG_REPORT_LIMITS.descriptionMin

  const handleCapture = async () => {
    setBusyImage(true)
    setError(null)
    try {
      // Hide this dialog for the capture so the screenshot shows the app, not the form.
      const el = overlayRef.current
      if (el) el.style.visibility = 'hidden'
      await nextFrame()
      const res = await window.skinforge.captureBugScreenshot()
      if (el) el.style.visibility = 'visible'
      if (res.ok && res.mime && res.dataBase64) setScreenshot({ mime: res.mime, dataBase64: res.dataBase64, sizeBytes: res.sizeBytes ?? 0 })
      else setError(res.error ?? 'Could not capture the window.')
    } finally {
      if (overlayRef.current) overlayRef.current.style.visibility = 'visible'
      setBusyImage(false)
    }
  }

  const handlePick = async () => {
    setBusyImage(true)
    setError(null)
    try {
      const res = await window.skinforge.pickBugScreenshot()
      if (res.ok && res.mime && res.dataBase64) setScreenshot({ mime: res.mime, dataBase64: res.dataBase64, sizeBytes: res.sizeBytes ?? 0 })
      else if (!res.canceled) setError(res.error ?? 'Could not attach that image.')
    } finally {
      setBusyImage(false)
    }
  }

  const handleSubmit = async () => {
    if (!context || !canSubmit) return
    setPhase('sending')
    setError(null)
    try {
      const res = await window.skinforge.submitBugReport({
        title,
        description,
        steps,
        logs: logText,
        includeLogs,
        diagnostics: context.diagnostics,
        screenshot: screenshot ? { mime: screenshot.mime, dataBase64: screenshot.dataBase64 } : undefined
      })
      if (res.ok) {
        setIssueUrl(res.issueUrl)
        setPhase(res.duplicate ? 'duplicate' : 'sent')
        useAppStore.getState().addLog(res.duplicate ? 'Bug report already exists.' : 'Bug report submitted. Thank you!', 'success')
      } else {
        setPhase('editing')
        setError(res.error ?? 'Failed to send the report.')
        useAppStore.getState().addLog(`Bug report failed: ${res.error ?? 'unknown error'}`, 'error')
      }
    } catch (e) {
      setPhase('editing')
      setError(e instanceof Error ? e.message : 'Failed to send the report.')
    }
  }

  const previewText = context
    ? [
        JSON.stringify(context.diagnostics, null, 2),
        includeLogs && context.errors ? `\n--- main process errors ---\n${redactSensitive(context.errors)}` : '',
        includeLogs ? `\n--- app log ---\n${logText}` : ''
      ].join('\n')
    : ''

  const done = phase === 'sent' || phase === 'duplicate'

  return (
    <div
      id="bugReportModal"
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="w-full max-w-xl max-h-[92vh] bg-bg-surface border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <Bug className="size-4.5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Report a Bug</h3>
              <p className="text-[11px] text-slate-400">Creates a public issue on our GitHub repository.</p>
            </div>
          </div>
          <button onClick={close} disabled={phase === 'sending'} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer disabled:opacity-40">
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <div className="p-8 flex flex-col items-center text-center gap-3">
            <CheckCircle2 className="size-12 text-emerald-400" />
            <h4 className="text-lg font-bold text-white">{phase === 'duplicate' ? 'Already reported' : 'Report sent. Thank you!'}</h4>
            <p className="text-sm text-slate-400 max-w-sm">
              {phase === 'duplicate' ? 'This bug has already been reported, so no new issue was created.' : 'Your report was created as a GitHub issue and will be reviewed.'}
            </p>
            <div className="flex gap-2 mt-2">
              {issueUrl && (
                <Button variant="ghost" onClick={() => window.skinforge.openExternal(issueUrl)}>
                  <ExternalLink className="size-4" /> View issue
                </Button>
              )}
              <Button onClick={() => setOpen(false)}>Close</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3.5 select-text">
              {!configured && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  Bug reporting is not configured in this build, so reports cannot be sent.
                </div>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-300">Title *</span>
                <input
                  className={FIELD}
                  value={title}
                  maxLength={BUG_REPORT_LIMITS.titleMax}
                  placeholder="Short summary, e.g. Install fails after selecting an Arcana"
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={phase === 'sending'}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-300">What went wrong? *</span>
                <textarea
                  className={`${FIELD} h-24 resize-none`}
                  value={description}
                  maxLength={BUG_REPORT_LIMITS.descriptionMax}
                  placeholder="Describe what happened and what you expected instead."
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={phase === 'sending'}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-300">Steps to reproduce</span>
                <textarea
                  className={`${FIELD} h-24 resize-none`}
                  value={steps}
                  maxLength={BUG_REPORT_LIMITS.stepsMax}
                  placeholder={'1. Open Heroes\n2. Equip ...\n3. Click Install'}
                  onChange={(e) => setSteps(e.target.value)}
                  disabled={phase === 'sending'}
                />
              </label>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-slate-300">Screenshot (optional)</span>
                {screenshot ? (
                  <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 p-2">
                    <img src={`data:${screenshot.mime};base64,${screenshot.dataBase64}`} alt="Attached screenshot" className="h-16 w-28 object-cover rounded border border-white/10" />
                    <span className="text-xs text-slate-400 flex-1">{(screenshot.sizeBytes / 1024).toFixed(0)} KB attached</span>
                    <Button variant="ghost" size="sm" onClick={() => setScreenshot(null)} disabled={phase === 'sending'}>
                      <Trash2 className="size-3.5" /> Remove
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={handleCapture} disabled={busyImage || phase === 'sending'}>
                      {busyImage ? <Loader2 className="size-3.5 animate-spin" /> : <Monitor className="size-3.5" />} Capture app window
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handlePick} disabled={busyImage || phase === 'sending'}>
                      <ImagePlus className="size-3.5" /> Choose image…
                    </Button>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-white/10 bg-black/20 p-3 flex flex-col gap-2">
                <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={includeLogs} onChange={(e) => setIncludeLogs(e.target.checked)} disabled={phase === 'sending'} />
                  <span>
                    Include recent app logs and error details
                    <span className="block text-[11px] text-slate-500">App version, OS and hardware basics are always included. User names, emails, Steam IDs and tokens are removed.</span>
                  </span>
                </label>
                <button type="button" className="self-start text-[11px] text-purple-300 hover:text-purple-200 cursor-pointer" onClick={() => setShowPreview((v) => !v)}>
                  {showPreview ? 'Hide' : 'Preview'} data that will be sent
                </button>
                {showPreview && <pre className="max-h-40 overflow-auto rounded bg-black/40 p-2 text-[10px] leading-snug text-slate-400 whitespace-pre-wrap break-all select-text">{previewText}</pre>}
              </div>

              <p className="text-[11px] text-slate-500">Reports are public. Do not include passwords or personal information in the text or screenshot.</p>

              {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</div>}
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/5 shrink-0">
              <Button variant="ghost" onClick={close} disabled={phase === 'sending'}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit}>
                {phase === 'sending' ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Sending…
                  </>
                ) : (
                  'Send report'
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
