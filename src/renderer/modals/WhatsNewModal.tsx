import { ExternalLink, Sparkles } from 'lucide-react'
import React from 'react'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { ReleaseNotesMarkdown } from '../components/ui/ReleaseNotesMarkdown'
import { useAppStore } from '../state/useAppStore'

export const WhatsNewModal: React.FC = () => {
  const isOpen = useAppStore((s) => s.isWhatsNewOpen)
  const info = useAppStore((s) => s.whatsNewInfo)
  const dismiss = useAppStore((s) => s.dismissWhatsNew)

  if (!info) return null

  const openReleasePage = () => {
    if (info.htmlUrl) void window.skinforge?.openExternal(info.htmlUrl)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => void dismiss()}
      maxWidth="max-w-xl"
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="size-4 text-purple-300" />
          What&apos;s new in v{info.version}?
        </span>
      }
      subtitle="Thanks for updating Dota 2 SkinForge. Here are the latest changes."
    >
      <div className="p-6 flex flex-col gap-5">
        {info.releaseNotes ? (
          <ReleaseNotesMarkdown className="max-h-[50vh] overflow-y-auto rounded-xl bg-black/30 border border-white/5 p-4 text-sm text-slate-300 leading-relaxed">
            {info.releaseNotes}
          </ReleaseNotesMarkdown>
        ) : (
          <div className="rounded-xl bg-purple-500/10 border border-purple-500/20 p-4 text-sm text-slate-300 leading-relaxed">
            {info.loading
              ? 'Loading release notes…'
              : info.error
                ? 'Release notes could not be loaded right now. You can check this version’s release page for details.'
                : 'This update includes fixes and improvements. More updates are on the way.'}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          {info.htmlUrl ? (
            <button
              type="button"
              onClick={openReleasePage}
              className="text-xs text-purple-300 hover:text-purple-200 inline-flex items-center gap-1.5 cursor-pointer"
            >
              View release page <ExternalLink className="size-3" />
            </button>
          ) : (
            <span />
          )}
          <Button variant="primary" onClick={() => void dismiss()}>
            Let&apos;s go
          </Button>
        </div>
      </div>
    </Modal>
  )
}
