import React from 'react'
import { clsx } from 'clsx'

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
        'relative inline-flex items-center cursor-pointer select-none',
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
      <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#8b5cf6] border border-white/10"></div>
    </label>
  )
}
