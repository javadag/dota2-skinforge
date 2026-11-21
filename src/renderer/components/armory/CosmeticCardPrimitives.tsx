import type { ReactNode } from 'react'

export const cosmeticGridClass = 'grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))] items-start gap-3'

export const cosmeticCardClass = 'w-full min-w-0 max-w-68 rounded-xl border bg-[#121826] transition-colors hover:bg-[#171f30]'

interface CosmeticThumbnailProps {
  src: string
  fallback: string
  fit?: 'cover' | 'contain'
  muted?: boolean
  zoom?: boolean
  accent?: string
}

export function CosmeticThumbnail({ src, fallback, fit = 'contain', muted = false, zoom, accent }: CosmeticThumbnailProps) {
  const imageClass = (isGlyph: boolean) =>
    isGlyph ? 'size-14 object-contain' : `size-full ${fit === 'cover' ? 'object-cover' : 'object-contain'} ${zoom ? 'scale-125' : ''}`

  return (
    <div
      className="aspect-16/10 flex w-full items-center justify-center overflow-hidden rounded-md border border-white/10 bg-[#0a0e18]"
      style={{ borderColor: accent }}
    >
      <img
        key={src}
        src={src}
        alt=""
        loading="lazy"
        className={`${imageClass(src.endsWith('.svg') || (muted && src.startsWith('data:')))} ${muted ? 'grayscale opacity-75' : ''}`}
        onError={({ currentTarget }) => {
          if (currentTarget.getAttribute('src') === fallback) return
          currentTarget.className = `${imageClass(fallback.endsWith('.svg') || !!muted)} ${muted ? 'grayscale opacity-75' : ''}`
          currentTarget.src = fallback
        }}
      />
    </div>
  )
}

interface CosmeticOptionProps {
  name: string
  detail: string
  selected: boolean
  thumbnail: ReactNode
  color?: string
  onSelect: () => void
  children?: ReactNode
}

export function CosmeticOption({ name, detail, selected, thumbnail, color, onSelect, children }: CosmeticOptionProps) {
  return (
    <article className={`${cosmeticCardClass} slot-item-option p-2 ${selected ? 'border-purple-500/60' : 'border-white/10'}`}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className="block w-full min-w-0 cursor-pointer rounded-md text-left focus-visible:outline-2 focus-visible:outline-purple-400"
      >
        {thumbnail}
        <div className="mt-2 truncate text-xs font-semibold text-white" title={name}>
          {name}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-1 text-[11px] text-slate-400">
          <span className="truncate" style={{ color }}>
            {detail}
          </span>
          {selected && <span className="shrink-0 font-semibold text-purple-300">Active</span>}
        </div>
      </button>
      {children}
    </article>
  )
}
