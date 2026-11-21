import { Check, ImageOff, Pencil, RotateCcw, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AbilityIconPreview, HeroAbilityIcons } from '../../../shared/types/abilityIcons'
import { useAppStore } from '../../state/useAppStore'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

const PAGE_SIZE = 96

function iconName(icon: string): string {
  return icon.replaceAll(/[_/]/g, ' ')
}

function Icon({ icon }: { icon: string }) {
  const [failed, setFailed] = useState(false)
  return failed ? (
    <ImageOff aria-hidden="true" className="m-auto size-5 text-slate-400" />
  ) : (
    <img
      src={`skinforge-icon://spellicons/${icon}.webp`}
      alt=""
      loading="lazy"
      className="size-full object-cover"
      onError={() => setFailed(true)}
    />
  )
}

function AbilityIconPicker({
  ability,
  data,
  override,
  onChoose,
  onClose
}: {
  ability: AbilityIconPreview
  data: HeroAbilityIcons
  override?: string
  onChoose: (icon?: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const active = override ?? ability.equippedIcon
  const scope = showAll ? data.catalog : data.related
  const lead = [ability.defaultIcon, ability.equippedIcon, active].filter((icon) => data.catalog.includes(icon))
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const filtered = [...new Set([...lead, ...scope])].filter((icon) =>
    terms.every((term) => iconName(icon).includes(term) || icon.includes(term))
  )

  return (
    <Modal isOpen onClose={onClose} title={ability.name} subtitle="Choose an ability icon" maxWidth="max-w-4xl">
      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-40 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2 focus-within:border-purple-400">
            <Search aria-hidden="true" className="size-4 text-slate-400" />
            <input
              autoFocus
              aria-label="Search icons"
              placeholder="Search icons"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-400"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setLimit(PAGE_SIZE)
              }}
            />
          </label>
          <select
            aria-label="Icon library"
            className="rounded-lg border border-white/10 bg-[#192131] px-2 py-2 text-sm text-white"
            value={showAll ? 'all' : 'hero'}
            onChange={(event) => {
              setShowAll(event.target.value === 'all')
              setLimit(PAGE_SIZE)
            }}
          >
            <option value="hero">Hero icons</option>
            <option value="all">All icons</option>
          </select>
          <Button variant="ghost" size="sm" disabled={!override} onClick={() => onChoose()}>
            <RotateCcw className="size-3.5" /> Use loadout icon
          </Button>
        </div>
        <p className="text-xs text-slate-400" aria-live="polite">
          {filtered.length} icons
        </p>
        {filtered.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
            {filtered.slice(0, limit).map((icon) => {
              const selected = icon === active
              const name = icon === ability.defaultIcon ? `Default · ${ability.name}` : iconName(icon)
              return (
                <button
                  key={icon}
                  type="button"
                  title={name}
                  aria-label={name}
                  aria-pressed={selected}
                  onClick={() => onChoose(icon)}
                  className={`relative flex aspect-square cursor-pointer overflow-hidden rounded-lg border-2 bg-black/30 focus-visible:outline-2 focus-visible:outline-purple-300 ${selected ? 'border-purple-400' : 'border-white/10 hover:border-white/40'}`}
                >
                  <Icon icon={icon} />
                  {selected && (
                    <Check aria-hidden="true" className="absolute right-1 top-1 size-4 rounded-full bg-purple-600 p-0.5 text-white" />
                  )}
                  {icon === ability.defaultIcon && (
                    <span className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-[10px] text-white">Default</span>
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-slate-400">No icons match your search.</p>
        )}
        {filtered.length > limit && (
          <Button variant="ghost" size="sm" onClick={() => setLimit(limit + PAGE_SIZE)}>
            Show more
          </Button>
        )}
      </div>
    </Modal>
  )
}

export function AbilityIconsBar({ hero }: { hero: string }) {
  const dotaPath = useAppStore((state) => state.dotaPath)
  const slots = useAppStore((state) => state.heroSlots[hero])
  const styles = useAppStore((state) => state.heroCustomizations[hero])
  const overrides = useAppStore((state) => state.heroAbilityIcons[hero])
  const setAbilityIcon = useAppStore((state) => state.setAbilityIcon)
  const resetHeroAbilityIcons = useAppStore((state) => state.resetHeroAbilityIcons)
  const [data, setData] = useState<HeroAbilityIcons | null>()
  const [editing, setEditing] = useState<string>()

  useEffect(() => {
    let active = true
    if (!window.skinforge?.getHeroAbilityIcons) {
      setData(null)
      return
    }
    window.skinforge.getHeroAbilityIcons(dotaPath, hero, slots ?? {}, styles ?? {}).then(
      (preview) => {
        if (active) setData(preview)
      },
      () => {
        if (active) setData(null)
      }
    )
    return () => {
      active = false
    }
  }, [dotaPath, hero, slots, styles])

  const ability = data?.abilities.find(({ id }) => id === editing)

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5" aria-label="Ability icons">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-200">Ability icons</h3>
        {overrides && (
          <button
            type="button"
            onClick={() => resetHeroAbilityIcons(hero)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded text-xs text-slate-300 hover:text-white focus-visible:outline-2 focus-visible:outline-purple-300"
          >
            <RotateCcw aria-hidden="true" className="size-3" /> Reset icons
          </button>
        )}
      </div>
      {data?.abilities.length ? (
        <div className="flex flex-wrap gap-2">
          {data.abilities.map((entry) => {
            const override = overrides?.[entry.id]
            const changed = entry.equippedIcon !== entry.defaultIcon
            const detail = override ? 'Custom icon' : changed ? (entry.source ?? 'From equipped cosmetics') : 'Default icon'
            const icon = override ?? entry.equippedIcon
            return (
              <button
                key={entry.id}
                type="button"
                aria-label={`${entry.name}. ${detail}. Change icon`}
                title={`${entry.name} · ${detail}`}
                onClick={() => setEditing(entry.id)}
                className={`group relative flex size-17 cursor-pointer overflow-hidden rounded-lg border-2 bg-black/30 focus-visible:outline-2 focus-visible:outline-purple-300 sm:size-19 ${override ? 'border-purple-400' : changed ? 'border-amber-400/80' : 'border-white/10 hover:border-white/40'}`}
              >
                <Icon key={icon} icon={icon} />
                <Pencil
                  aria-hidden="true"
                  className="absolute right-1 top-1 size-4 rounded bg-slate-950/80 p-0.5 text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                />
                <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black via-black/80 to-transparent px-0.5 pb-0.5 pt-2 text-[10px] leading-tight text-white">
                  Ability {entry.slot}
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="text-xs text-slate-400">
          {data === undefined ? 'Loading ability icons…' : 'Ability icons unavailable. Check your Dota 2 installation.'}
        </p>
      )}
      {data && ability && (
        <AbilityIconPicker
          key={ability.id}
          ability={ability}
          data={data}
          override={overrides?.[ability.id]}
          onChoose={(icon) => {
            setAbilityIcon(hero, ability.id, icon)
            setEditing(undefined)
          }}
          onClose={() => setEditing(undefined)}
        />
      )}
    </section>
  )
}
