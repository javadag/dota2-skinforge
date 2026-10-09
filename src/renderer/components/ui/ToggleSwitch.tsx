import { clsx } from 'clsx'
import React from 'react'

export interface ToggleSwitchProps {
  id?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ id, checked, onChange, disabled = false, className }) => {
  return (
    <label
      className={clsx(
        'relative inline-block w-11 h-6 cursor-pointer select-none shrink-0',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <input
        type="checkbox"
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <span
        className={clsx(
          'absolute inset-0 rounded-full transition-all duration-200 border border-white/10',
          'bg-white/10 peer-checked:bg-accent-purple peer-checked:border-purple-500/50 peer-checked:shadow-[0_0_10px_rgba(139,92,246,0.4)]',
          "before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:w-4.5 before:h-4.5 before:rounded-full before:bg-white before:transition-transform before:duration-200 before:shadow-md",
          'peer-checked:before:translate-x-5'
        )}
      />
    </label>
  )
}
