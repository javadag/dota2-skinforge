import React from 'react'
import { HeroList } from './HeroList'
import { SlotEditor } from './SlotEditor'

export const HeroesView: React.FC = () => {
  return (
    <section id="tabHeroes" className="flex-1 h-full flex overflow-hidden">
      <div className="flex-1 h-full flex overflow-hidden">
        <HeroList />
        <SlotEditor />
      </div>
    </section>
  )
}
