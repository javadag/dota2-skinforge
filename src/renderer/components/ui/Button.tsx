import { clsx } from 'clsx'
import React from 'react'
import { twMerge } from 'tailwind-merge'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'play' | 'ghost' | 'danger' | 'secondary' | 'icon'
  size?: 'sm' | 'md' | 'lg'
  glow?: boolean
}

export const Button: React.FC<ButtonProps> = ({ variant = 'primary', size = 'md', glow = false, className, children, ...props }) => {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-semibold cursor-pointer select-none whitespace-nowrap shrink-0 transition-all outline-none disabled:opacity-50 disabled:pointer-events-none'

  const variants = {
    primary:
      'bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] text-white shadow-[0_2px_10px_rgba(109,40,217,0.35)] hover:-translate-y-px hover:shadow-[0_4px_16px_rgba(109,40,217,0.5)] active:translate-y-0',
    play: 'bg-gradient-to-br from-[#10b981] to-[#059669] text-white font-bold tracking-wide shadow-[0_2px_10px_rgba(16,185,129,0.35)] hover:-translate-y-px hover:shadow-[0_4px_18px_rgba(16,185,129,0.55)] active:translate-y-0',
    ghost: 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white hover:border-white/20',
    danger: 'bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 hover:border-rose-500/50 hover:text-white',
    secondary: 'bg-white/10 text-white hover:bg-white/15',
    icon: 'p-2 w-[34px] h-[34px] bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white'
  }

  const sizes = {
    sm: 'px-3.5 py-1.5 text-xs rounded-md',
    md: 'px-4.5 py-2 text-[13px] rounded-lg',
    lg: 'px-6 py-2.5 text-sm rounded-lg'
  }

  const glowStyle = glow ? 'shadow-[0_0_18px_rgba(139,92,246,0.4)]' : ''

  return (
    <button className={twMerge(clsx(base, variants[variant], variant !== 'icon' && sizes[size], glowStyle, className))} {...props}>
      {children}
    </button>
  )
}
