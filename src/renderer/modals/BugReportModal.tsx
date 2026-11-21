import {
  ArrowLeft,
  Bug,
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  Loader2,
  MessageSquare,
  Monitor,
  RefreshCw,
  Send,
  Trash2
} from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TrackedBugReportItem } from '../../shared/types/ipc'
import { BUG_REPORT_LIMITS, redactSensitive, type BugReportDiagnostics } from '../../shared/utils/bugReport'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { useAppStore } from '../state/useAppStore'

type Tab = 'new' | 'history'
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

  const [tab, setTab] = useState<Tab>('new')
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

  // My Reports state
  const [reports, setReports] = useState<TrackedBugReportItem[]>([])
  const [loadingReports, setLoadingReports] = useState(false)
  const [reportsOffline, setReportsOffline] = useState(false)
  const [selectedIssue, setSelectedIssue] = useState<number | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replyScreenshot, setReplyScreenshot] = useState<Screenshot | null>(null)
  const [sendingReply, setSendingReply] = useState(false)
  const [replyError, setReplyError] = useState<string | null>(null)

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

  const loadReports = useCallback(async () => {
    setLoadingReports(true)
    try {
      const res = await window.skinforge.listBugReports()
      setReports(res.reports)
      setReportsOffline(Boolean(res.offline))
    } catch {
      setReportsOffline(true)
    } finally {
      setLoadingReports(false)
    }
  }, [])

  const close = useCallback(() => {
    if (phase === 'sending' || sendingReply) return
    setOpen(false)
  }, [phase, sendingReply, setOpen])

  // Load diagnostics each time the dialog opens; start a fresh form after a completed submit.
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
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
      .then((ctx) => {
        if (!cancelled) setContext(ctx)
      })
      .catch(() => {
        if (cancelled) return
        setContext(null)
        setError('Could not load diagnostic information. Please close and reopen this dialog.')
      })
    void loadReports()
    return () => {
      cancelled = true
    }
    // Only on open; the form must not reset while the user is typing.
  }, [isOpen])

  if (!isOpen) return null

  const configured = context?.configured ?? true
  const canSubmit =
    Boolean(context) &&
    phase === 'editing' &&
    configured &&
    title.trim().length >= BUG_REPORT_LIMITS.titleMin &&
    description.trim().length >= BUG_REPORT_LIMITS.descriptionMin

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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not capture the window.')
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not attach that image.')
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
        void loadReports()
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

  const handlePickReplyImage = async () => {
    setBusyImage(true)
    setReplyError(null)
    try {
      const res = await window.skinforge.pickBugScreenshot()
      if (res.ok && res.mime && res.dataBase64)
        setReplyScreenshot({ mime: res.mime, dataBase64: res.dataBase64, sizeBytes: res.sizeBytes ?? 0 })
      else if (!res.canceled) setReplyError(res.error ?? 'Could not attach that image.')
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : 'Could not attach that image.')
    } finally {
      setBusyImage(false)
    }
  }

  const handleSendReply = async (issueNumber: number) => {
    if (sendingReply || replyText.trim().length < BUG_REPORT_LIMITS.commentMin) return
    setSendingReply(true)
    setReplyError(null)
    try {
      const res = await window.skinforge.commentOnBugReport({
        issueNumber,
        message: replyText,
        screenshot: replyScreenshot ? { mime: replyScreenshot.mime, dataBase64: replyScreenshot.dataBase64 } : undefined
      })
      if (res.ok && res.comment) {
        const added = res.comment
        setReports((prev) => prev.map((r) => (r.issueNumber === issueNumber ? { ...r, comments: [...r.comments, added] } : r)))
        setReplyText('')
        setReplyScreenshot(null)
      } else {
        setReplyError(res.error ?? 'Could not post your update.')
      }
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : 'Could not post your update.')
    } finally {
      setSendingReply(false)
    }
  }

  const selectedReport = selectedIssue !== null ? (reports.find((r) => r.issueNumber === selectedIssue) ?? null) : null
  const previewText = context
    ? [
        JSON.stringify(context.diagnostics, null, 2),
        includeLogs && context.errors ? `\n--- main process errors ---\n${redactSensitive(context.errors)}` : '',
        includeLogs ? `\n--- app log ---\n${logText}` : ''
      ].join('\n')
    : ''

  const done = phase === 'sent' || phase === 'duplicate'

  return (
    <Modal
      id="bugReportModal"
      isOpen
      onClose={close}
      canClose={phase !== 'sending' && !sendingReply}
      overlayRef={overlayRef}
      maxWidth="max-w-xl"
      bodyClassName="flex flex-col min-h-0 overflow-hidden"
      title={
        <span className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <Bug className="size-4.5" />
          </span>
          Report a Bug
        </span>
      }
      subtitle="Creates a public issue on our GitHub repository."
    >
      <div className="flex items-center gap-1 px-6 pt-3 pb-2 border-b border-white/5 shrink-0">
        <button
          type="button"
          disabled={phase === 'sending' || sendingReply}
          onClick={() => setTab('new')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 cursor-pointer ${
            tab === 'new' ? 'bg-purple-500/20 text-purple-200 border border-purple-500/30' : 'text-slate-400 hover:text-white'
          }`}
        >
          New Report
        </button>
        <button
          type="button"
          disabled={phase === 'sending' || sendingReply}
          onClick={() => {
            setTab('history')
            void loadReports()
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 cursor-pointer flex items-center gap-1.5 ${
            tab === 'history' ? 'bg-purple-500/20 text-purple-200 border border-purple-500/30' : 'text-slate-400 hover:text-white'
          }`}
        >
          My Reports
          {reports.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-white/10 text-[10px] text-slate-200">{reports.length}</span>
          )}
        </button>
      </div>

      {tab === 'history' ? (
        selectedReport ? (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="px-6 py-3 border-b border-white/5 flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                disabled={sendingReply}
                onClick={() => {
                  setSelectedIssue(null)
                  setReplyText('')
                  setReplyScreenshot(null)
                  setReplyError(null)
                }}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white disabled:opacity-40 cursor-pointer"
              >
                <ArrowLeft className="size-3.5" /> All reports
              </button>
              <Button variant="ghost" size="sm" onClick={() => window.skinforge.openExternal(selectedReport.issueUrl)}>
                <ExternalLink className="size-3.5" /> View on GitHub
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3 select-text">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[11px] text-slate-500">#{selectedReport.issueNumber}</span>
                  <h4 className="text-sm font-semibold text-white">{selectedReport.title}</h4>
                </div>
                <span
                  className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    selectedReport.state === 'closed'
                      ? 'bg-purple-500/20 text-purple-200 border border-purple-500/30'
                      : selectedReport.state === 'open'
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : 'bg-white/10 text-slate-300'
                  }`}
                >
                  {selectedReport.state === 'closed' ? 'Closed' : selectedReport.state === 'open' ? 'Open' : 'Saved'}
                </span>
              </div>

              {selectedReport.labels.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedReport.labels.map((label) => (
                    <span key={label} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-slate-300">
                      {label}
                    </span>
                  ))}
                </div>
              )}

              <div className="border-t border-white/5 pt-3 flex flex-col gap-2.5">
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <MessageSquare className="size-3.5 text-slate-400" /> Updates &amp; replies ({selectedReport.comments.length})
                </span>
                {selectedReport.comments.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2">No replies yet. You can add an update below if you have new details.</p>
                ) : (
                  selectedReport.comments.map((c) => (
                    <div
                      key={c.id}
                      className={`rounded-lg border p-3 text-xs flex flex-col gap-1 ${
                        c.fromReporter ? 'border-purple-500/25 bg-purple-500/10' : 'border-white/10 bg-black/25'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className={`font-semibold ${c.fromReporter ? 'text-purple-200' : 'text-emerald-300'}`}>
                          {c.fromReporter ? 'You' : c.author}
                        </span>
                        <span className="text-slate-500">{new Date(c.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-slate-200 whitespace-pre-wrap wrap-break-word">{c.body}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="px-6 py-3 border-t border-white/5 flex flex-col gap-2 shrink-0 bg-black/20">
              <textarea
                className={`${FIELD} h-20 resize-none`}
                value={replyText}
                maxLength={BUG_REPORT_LIMITS.commentMax}
                placeholder="Add an update, extra details, or reply..."
                onChange={(e) => setReplyText(e.target.value)}
                disabled={sendingReply}
              />
              {replyScreenshot && (
                <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5">
                  <img
                    src={`data:${replyScreenshot.mime};base64,${replyScreenshot.dataBase64}`}
                    alt="Attached screenshot"
                    className="h-8 w-14 object-cover rounded border border-white/10"
                  />
                  <span className="text-[11px] text-slate-400 flex-1">{(replyScreenshot.sizeBytes / 1024).toFixed(0)} KB attached</span>
                  <button
                    type="button"
                    onClick={() => setReplyScreenshot(null)}
                    disabled={sendingReply}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
              {replyError && <div className="text-xs text-rose-300">{replyError}</div>}
              <div className="flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={handlePickReplyImage} disabled={busyImage || sendingReply}>
                  <ImagePlus className="size-3.5" /> Attach image
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleSendReply(selectedReport.issueNumber)}
                  disabled={sendingReply || replyText.trim().length < BUG_REPORT_LIMITS.commentMin}
                >
                  {sendingReply ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                  {sendingReply ? 'Sending…' : 'Send update'}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="px-6 py-2.5 flex items-center justify-between border-b border-white/5 shrink-0">
              <span className="text-xs text-slate-400">
                {reportsOffline ? 'Showing locally saved reports (offline)' : 'Click a report to view replies or add an update'}
              </span>
              <Button variant="ghost" size="sm" onClick={() => void loadReports()} disabled={loadingReports}>
                <RefreshCw className={`size-3.5 ${loadingReports ? 'animate-spin' : ''}`} /> Refresh
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-2">
              {loadingReports && reports.length === 0 ? (
                <div className="py-12 flex items-center justify-center text-slate-400 text-xs gap-2">
                  <Loader2 className="size-4 animate-spin" /> Loading your reports…
                </div>
              ) : reports.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  You haven&apos;t submitted any bug reports from this installation yet.
                </div>
              ) : (
                reports.map((r) => (
                  <button
                    key={r.issueNumber}
                    type="button"
                    onClick={() => {
                      setSelectedIssue(r.issueNumber)
                      setReplyText('')
                      setReplyScreenshot(null)
                      setReplyError(null)
                    }}
                    className="w-full text-left rounded-lg border border-white/10 bg-black/25 hover:bg-white/5 p-3 transition-colors cursor-pointer flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        <span>#{r.issueNumber}</span>
                        <span>•</span>
                        <span>{new Date(r.submittedAt).toLocaleDateString()}</span>
                        {r.comments.length > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-slate-300 flex items-center gap-1">
                              <MessageSquare className="size-3" /> {r.comments.length}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="text-xs font-semibold text-white truncate mt-0.5">{r.title}</div>
                    </div>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        r.state === 'closed'
                          ? 'bg-purple-500/20 text-purple-200 border border-purple-500/30'
                          : r.state === 'open'
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-white/10 text-slate-300'
                      }`}
                    >
                      {r.state === 'closed' ? 'Closed' : r.state === 'open' ? 'Open' : 'Saved'}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )
      ) : done ? (
        <div className="p-8 flex flex-col items-center text-center gap-3">
          <CheckCircle2 className="size-12 text-emerald-400" />
          <h4 className="text-lg font-bold text-white">{phase === 'duplicate' ? 'Already reported' : 'Report sent. Thank you!'}</h4>
          <p className="text-sm text-slate-400 max-w-sm">
            {phase === 'duplicate'
              ? 'This bug has already been reported, so no new issue was created.'
              : 'Your report was created as a GitHub issue and will be reviewed.'}
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {issueUrl && (
              <Button variant="ghost" onClick={() => window.skinforge.openExternal(issueUrl)}>
                <ExternalLink className="size-4" /> View issue
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                setTab('history')
                void loadReports()
              }}
            >
              My Reports
            </Button>
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
                  <img
                    src={`data:${screenshot.mime};base64,${screenshot.dataBase64}`}
                    alt="Attached screenshot"
                    className="h-16 w-28 object-cover rounded border border-white/10"
                  />
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
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={includeLogs}
                  onChange={(e) => setIncludeLogs(e.target.checked)}
                  disabled={phase === 'sending'}
                />
                <span>
                  Include recent app logs and error details
                  <span className="block text-[11px] text-slate-500">
                    App version, OS and hardware basics are always included. User names, emails, Steam IDs and tokens are removed.
                  </span>
                </span>
              </label>
              <button
                type="button"
                className="self-start text-[11px] text-purple-300 hover:text-purple-200 cursor-pointer"
                onClick={() => setShowPreview((v) => !v)}
              >
                {showPreview ? 'Hide' : 'Preview'} data that will be sent
              </button>
              {showPreview && (
                <pre className="max-h-40 overflow-auto rounded bg-black/40 p-2 text-[10px] leading-snug text-slate-400 whitespace-pre-wrap break-all select-text">
                  {previewText}
                </pre>
              )}
            </div>

            <p className="text-[11px] text-slate-500">
              Reports are public. Do not include passwords or personal information in the text or screenshot.
            </p>

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
    </Modal>
  )
}
