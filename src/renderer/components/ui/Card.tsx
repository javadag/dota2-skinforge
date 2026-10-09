import { clsx } from 'clsx'
import React from 'react'
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
          glass ? 'bg-bg-card backdrop-blur-md' : 'bg-surface',
          hoverable && 'hover:bg-bg-card-hover hover:border-white/15 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer',
          className
        )
      )}
      {...props}
    >
      {children}
    </div>
  )
}
