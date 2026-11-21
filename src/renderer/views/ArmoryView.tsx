import React from 'react'
import { CatalogSidebar } from '../components/armory/CatalogSidebar'
import { LoadoutPanel } from '../components/armory/LoadoutPanel'

export const ArmoryView: React.FC = () => (
  <section id="tabHeroes" className="flex-1 h-full flex overflow-hidden">
    <CatalogSidebar />
    <LoadoutPanel />
  </section>
)
