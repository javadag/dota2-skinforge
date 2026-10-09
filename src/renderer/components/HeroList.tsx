import React from 'react'
import { Search } from 'lucide-react'
import { CATEGORY_META, isCategoryKey } from '../../data/categoryMeta'
import { getAttrLabel, getHeroAttribute } from '../utils/attributes'
import { formatHeroName } from './slotGenerator'
import { useAppStore, type AttributeFilter } from '../state/useAppStore'

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

  return (
    <div className="hero-list-panel">
      {/* Search Bar */}
      <div className="hlp-search">
        <Search className="search-ico" />
        <input
          type="text"
          id="heroSearch"
          placeholder="Search heroes, creeps, music, weather..."
          autoComplete="off"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Attribute Filters Bar */}
      <div
        className="hlp-filters"
        id="heroAttrFilters"
        style={{ display: activeCategoryGroup === 'hero' ? 'flex' : 'none' }}
      >
        {(['all', 'str', 'agi', 'int', 'uni'] as AttributeFilter[]).map((attr) => (
          <button
            key={attr}
            className={`hf-btn ${attrFilter === attr ? 'active' : ''}`}
            data-attr={attr}
            onClick={() => setAttrFilter(attr)}
          >
            {attr.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Hero List Scroll */}
      <div id="heroListScroll" className="hero-list-scroll">
        {filtered.map((h) => {
          const isHero = !h.g || h.g === 'hero'
          const heroAttr = getHeroAttribute(h.tag)
          const isSelected = selectedHero?.tag === h.tag
          const heroModCount = Object.keys(heroSlots[h.tag] || {}).length
          const imgSrc =
            h.img || (isHero ? `../assets/heroes/${h.tag.replace(/\s+/g, '_')}.png` : '../assets/categories/default.svg')
          const thumbClass = isHero ? 'hero-item-thumb' : 'hero-item-thumb is-category'
          const catMeta = h.g && isCategoryKey(h.g) ? CATEGORY_META[h.g] : null

          return (
            <div
              key={h.tag}
              className={`hero-list-item ${isSelected ? 'active' : ''} ${heroModCount > 0 ? 'has-modded-slots' : ''}`}
              onClick={() => setSelectedHero(h)}
            >
              <img
                src={imgSrc}
                alt={h.tag}
                className={thumbClass}
                onError={(e) => {
                  e.currentTarget.onerror = null
                  e.currentTarget.src = fallbackHeroSvg
                }}
              />
              <div className="hero-item-meta">
                <span className="hero-item-name">{formatHeroName(h.tag)}</span>
                <div className="hero-item-sub">
                  {isHero ? (
                    <>
                      <span className={`hero-attr-dot ${heroAttr}`} />
                      <span>{getAttrLabel(heroAttr)}</span>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: '12px' }}>{catMeta ? catMeta.icon : '✨'}</span>
                      <span>{catMeta ? catMeta.name : 'Item'}</span>
                    </>
                  )}
                </div>
              </div>
              <span className="hero-item-badge">
                {heroModCount > 0 ? `${heroModCount} slots` : (h.mods || '★')}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
