import React from 'react'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { useAppStore } from '../state/useAppStore'

export const DialogModal: React.FC = () => {
  const dialog = useAppStore((s) => s.dialog)
  const resolveDialog = useAppStore((s) => s.resolveDialog)

  if (!dialog) return null

  return (
    <Modal id="appDialogModal" isOpen onClose={() => resolveDialog(false)} maxWidth="max-w-md" title={dialog.title}>
      <div className="p-6 flex flex-col gap-5">
        <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">{dialog.message}</p>
        <div className="flex justify-end gap-2.5">
          {dialog.kind === 'confirm' && (
            <Button id="btnDialogCancel" variant="ghost" onClick={() => resolveDialog(false)}>
              {dialog.cancelText ?? 'Cancel'}
            </Button>
          )}
          <Button id="btnDialogConfirm" variant={dialog.danger ? 'danger' : 'primary'} onClick={() => resolveDialog(true)} autoFocus>
            {dialog.confirmText ?? (dialog.kind === 'alert' ? 'OK' : 'Confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
