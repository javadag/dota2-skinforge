import React from 'react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean
  glass?: boolean
}

export const Card: React.FC<CardProps> = ({ hoverable = false, glass = true, className, children, ...props }) => {
  return (
    <div
      className={twMerge(
        clsx(
          'rounded-xl border border-white/[0.07] p-4 transition-all',
          glass ? 'bg-[rgba(18,24,38,0.72)] backdrop-blur-md' : 'bg-surface',
          hoverable && 'hover:bg-[rgba(28,38,60,0.88)] hover:border-white/15 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer',
          className
        )
      )}
      {...props}
    >
      {children}
    </div>
  )
}
