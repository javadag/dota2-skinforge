import React from 'react'
import { HeroList } from './HeroList'
import { SlotEditor } from './SlotEditor'

export const HeroesView: React.FC = () => {
  return (
    <section id="tabHeroes" className="tab-section active">
      <div className="heroes-layout">
        <HeroList />
        <SlotEditor />
      </div>
    </section>
  )
}
