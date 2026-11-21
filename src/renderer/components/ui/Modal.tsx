import { clsx } from 'clsx'
import { X } from 'lucide-react'
import React, { useEffect, useRef } from 'react'
import { twMerge } from 'tailwind-merge'

export interface ModalProps {
  id?: string
  isOpen: boolean
  onClose: () => void
  /** Set false while an async action (e.g. download/submit) should prevent closing. */
  canClose?: boolean
  overlayRef?: React.Ref<HTMLDivElement>
  title?: React.ReactNode
  subtitle?: React.ReactNode
  maxWidth?: string
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}

export const Modal: React.FC<ModalProps> = ({
  id,
  isOpen,
  onClose,
  canClose = true,
  overlayRef,
  title,
  subtitle,
  maxWidth = 'max-w-2xl',
  className,
  bodyClassName,
  children
}) => {
  const mouseDownOnBackdrop = useRef(false)

  useEffect(() => {
    if (!isOpen || !canClose) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, canClose, onClose])

  if (!isOpen) return null

  return (
    <div
      id={id}
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
      onMouseDown={(e) => {
        mouseDownOnBackdrop.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (canClose && mouseDownOnBackdrop.current && e.target === e.currentTarget) onClose()
        mouseDownOnBackdrop.current = false
      }}
    >
      <div
        className={twMerge(
          clsx(
            'w-full rounded-2xl border border-white/10 bg-[#0f1422] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]',
            maxWidth,
            className
          )
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || subtitle) && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
            <div>
              {title && <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>}
              {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={() => canClose && onClose()}
              disabled={!canClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-40"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className={twMerge('flex-1 overflow-y-auto', bodyClassName)}>{children}</div>
      </div>
    </div>
  )
}
