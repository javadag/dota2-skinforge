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
    <label className={clsx('toggle-switch', disabled && 'opacity-50 cursor-not-allowed', className)}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle-slider" />
    </label>
  )
}
