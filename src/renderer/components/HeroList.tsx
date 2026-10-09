import { Search } from 'lucide-react'
import React from 'react'
import { useAppStore, type AttributeFilter } from '../state/useAppStore'
import { getAttrLabel, getHeroAttribute } from '../utils/attributes'
import { formatHeroName } from './slotGenerator'

const fallbackHeroSvg =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="6" fill="#141a29"/><text x="20" y="25" fill="#64748b" font-size="16" text-anchor="middle">?</text></svg>'
  )

export const HeroList: React.FC = () => {
  const heroes = useAppStore((s) => s.heroes)
  const selectedHero = useAppStore((s) => s.selectedHero)
  const setSelectedHero = useAppStore((s) => s.setSelectedHero)
  const activeCategoryGroup = useAppStore((s) => s.activeCategoryGroup)
  const attrFilter = useAppStore((s) => s.attrFilter)
  const setAttrFilter = useAppStore((s) => s.setAttrFilter)
  const searchQuery = useAppStore((s) => s.searchQuery)
  const setSearchQuery = useAppStore((s) => s.setSearchQuery)
  const heroSlots = useAppStore((s) => s.heroSlots)

  const query = searchQuery.toLowerCase().trim()

  const filtered = heroes.filter((h) => {
    const itemGroup = h.g || 'hero'

    if (activeCategoryGroup !== 'all') {
      if (activeCategoryGroup === 'hero' && itemGroup !== 'hero') return false
      if (activeCategoryGroup !== 'hero' && itemGroup !== activeCategoryGroup) return false
    }

    if (itemGroup === 'hero' && activeCategoryGroup === 'hero') {
      const heroAttr = getHeroAttribute(h.tag)
      if (attrFilter !== 'all' && heroAttr !== attrFilter) return false
    }

    if (query) {
      const matchName = h.tag.toLowerCase().includes(query) || formatHeroName(h.tag).toLowerCase().includes(query)
      const matchAlias = h.alias && h.alias.some((a) => a.toLowerCase().includes(query))
      if (!matchName && !matchAlias) return false
    }

    return true
  })

  const getAttrDotColor = (attr: string) => {
    switch (attr) {
      case 'str':
        return 'bg-red-500 shadow-[0_0_6px_#ef4444]'
      case 'agi':
        return 'bg-emerald-400 shadow-[0_0_6px_#10b981]'
      case 'int':
        return 'bg-cyan-400 shadow-[0_0_6px_#06b6d4]'
      case 'uni':
        return 'bg-purple-400 shadow-[0_0_6px_#a855f7]'
      default:
        return 'bg-red-500'
    }
  }

  return (
    <div className="w-72 h-full flex flex-col shrink-0 border-r border-white/5 bg-[#0e121d]/50">
      {/* Search Bar */}
      <div className="px-3.5 py-3 border-b border-white/5 relative flex items-center">
        <Search className="w-4 h-4 text-slate-400 absolute left-6 pointer-events-none" />
        <input
          type="text"
          id="heroSearch"
          className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-slate-400 outline-none focus:border-purple-500/50 transition-colors"
          placeholder="Search heroes, creeps, music, weather..."
          autoComplete="off"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Attribute Filters Bar */}
      <div
        className="px-3 py-2 border-b border-white/5 flex gap-1 bg-black/10"
        id="heroAttrFilters"
        style={{ display: activeCategoryGroup === 'hero' ? 'flex' : 'none' }}
      >
        {(['all', 'str', 'agi', 'int', 'uni'] as AttributeFilter[]).map((attr) => (
          <button
            key={attr}
            className={`hf-btn flex-1 py-1 text-center rounded text-[11px] font-semibold transition-all border cursor-pointer ${
              attrFilter === attr
                ? 'bg-purple-500/20 text-white border-purple-500/40 shadow-[0_0_8px_rgba(139,92,246,0.3)]'
                : 'bg-white/5 text-slate-400 border-transparent hover:text-white hover:bg-white/10'
            }`}
            data-attr={attr}
            onClick={() => setAttrFilter(attr)}
          >
            {attr.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Hero List Scroll */}
      <div id="heroListScroll" className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
        {filtered.map((h) => {
          const isHero = !h.g || h.g === 'hero'
          const heroAttr = getHeroAttribute(h.tag)
          const isSelected = selectedHero?.tag === h.tag
          const heroModCount = Object.keys(heroSlots[h.tag] || {}).length
          const imgSrc = h.img || (isHero ? `../assets/heroes/${h.tag.replace(/\s+/g, '_')}.png` : '../assets/categories/default.svg')

          return (
            <div
              key={h.tag}
              className={`hero-list-item flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all border ${
                isSelected
                  ? 'bg-purple-500/15 border-purple-500/40 shadow-[0_0_12px_rgba(139,92,246,0.2)]'
                  : heroModCount > 0
                    ? 'border-purple-500/25 hover:bg-white/5'
                    : 'border-transparent hover:bg-white/5'
              }`}
              onClick={() => setSelectedHero(h)}
            >
              <img
                src={imgSrc}
                alt={h.tag}
                className={`hero-item-thumb w-16 rounded-md object-cover border border-white/10 shrink-0 ${isHero ? '' : 'bg-white/5'}`}
                onError={(e) => {
                  e.currentTarget.onerror = null
                  e.currentTarget.src = fallbackHeroSvg
                }}
              />
              <div className="flex-1 min-w-0">
                <span className="hero-item-name block text-xs font-semibold text-white truncate">{formatHeroName(h.tag)}</span>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                  {isHero ? (
                    <>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${getAttrDotColor(heroAttr)}`} />
                      <span>{getAttrLabel(heroAttr)}</span>
                    </>
                  ) : (
                    <></>
                  )}
                </div>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/5 text-slate-300 border border-white/10 shrink-0">
                {heroModCount > 0 ? `${heroModCount} slots` : h.mods || '★'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
