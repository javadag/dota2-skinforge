// Catalog of Equipment Slots and Official Items for Non-Hero Categories
export const NON_HERO_SLOTS_CATALOG = {
  'creeps': {
    slots: [
      { id: 'radiant_creeps', name: 'Radiant Creeps', icon: '🌲' },
      { id: 'dire_creeps', name: 'Dire Creeps', icon: '🌋' },
      { id: 'siege_engine', name: 'Siege Engine (Catapult)', icon: '🛡️' },
      { id: 'mega_creeps', name: 'Mega Creeps', icon: '⚔️' }
    ],
    items: {
      'radiant_creeps': [
        { name: 'Reptilian Refuge Creeps (TI9 Battle Pass)', tag: 'Exclusive', best: true },
        { name: 'Cavern Crawl Radiant Minions', tag: 'Mythical' },
        { name: 'Frostivus Frostbite Creeps', tag: 'Holiday' },
        { name: 'Ancient Radiant Sentinels', tag: 'Rare' }
      ],
      'dire_creeps': [
        { name: 'Reptilian Refuge Dire Creeps (TI9)', tag: 'Exclusive', best: true },
        { name: 'Cavern Crawl Dire Fiends', tag: 'Mythical' },
        { name: 'Frostivus Dire Ghouls', tag: 'Holiday' },
        { name: 'Lava Fiends of the Pit', tag: 'Rare' }
      ],
      'siege_engine': [
        { name: 'Ancient Siege Catapult', tag: 'Mythical', best: true },
        { name: 'Clockwerk Golem Engine', tag: 'Rare' }
      ],
      'mega_creeps': [
        { name: 'Colossal Titan Mega Creeps', tag: 'Immortal', best: true },
        { name: 'Underworld Overlord Mega Creeps', tag: 'Mythical' }
      ]
    }
  },

  'music_packs': {
    slots: [
      { id: 'soundtrack', name: 'Main Soundtrack Theme', icon: '🎵' },
      { id: 'combat_music', name: 'Combat & Rosh Battle', icon: '⚔️' },
      { id: 'respawn_music', name: 'Smoke & Death Stinger', icon: '🎺' }
    ],
    items: {
      'soundtrack': [
        { name: 'The International 2022 Official Theme', tag: 'Exclusive', best: true },
        { name: 'Deadmau5 — dieback Music Pack', tag: 'Mythical' },
        { name: 'The FatRat — Warrior Songs Music Pack', tag: 'Mythical' },
        { name: 'AWOLNATION — Magic Stick Music Pack', tag: 'Rare' },
        { name: 'Matt Lange — Abstraction Music Pack', tag: 'Mythical' },
        { name: 'Heroes Within Music Pack', tag: 'Rare' },
        { name: 'JJ Lin — Timekeeper Music Pack', tag: 'Mythical' }
      ],
      'combat_music': [
        { name: 'Dynamic Symphonic Battle Climax', tag: 'Orchestral', best: true },
        { name: 'Heavy Metal Rosh Fight Suite', tag: 'Rock' },
        { name: 'Electronic High BPM Teamfight', tag: 'Synth' }
      ],
      'respawn_music': [
        { name: 'Aegis Triumph Stinger', tag: 'Epic', best: true },
        { name: 'Lament of the Fallen Core', tag: 'Atmospheric' }
      ]
    }
  },

  'official_music_packs': {
    slots: [
      { id: 'soundtrack', name: 'Valve Official Suite', icon: '🎵' }
    ],
    items: {
      'soundtrack': [
        { name: 'Valve Studio Orchestra — The International 10', tag: 'Official', best: true },
        { name: 'Dota 2 Classic Soundtrack Remastered', tag: 'Valve Base' },
        { name: 'Gabe Newell Official Anniversary Music', tag: 'Special' },
        { name: 'The International 2018 Orchestral Suite', tag: 'Official' }
      ]
    }
  },

  'announcers': {
    slots: [
      { id: 'announcer', name: 'Main Announcer', icon: '🎙️' },
      { id: 'mega_kills', name: 'Mega-Kills Announcer', icon: '💀' }
    ],
    items: {
      'announcer': [
        { name: 'Gabe Newell Announcer Pack', tag: 'Legendary', best: true },
        { name: 'Rick and Morty Announcer Pack', tag: 'Mythical' },
        { name: 'The Stanley Parable Announcer Pack', tag: 'Mythical' },
        { name: 'Bastion Announcer (Logan Cunningham)', tag: 'Mythical' },
        { name: 'Portal GLaDOS Announcer Pack', tag: 'Mythical' },
        { name: 'Dark Willow Announcer Pack', tag: 'Rare' },
        { name: 'Deus Ex Adam Jensen Announcer', tag: 'Rare' }
      ],
      'mega_kills': [
        { name: 'Gabe Newell Mega-Kills', tag: 'Legendary', best: true },
        { name: 'Rick and Morty Mega-Kills', tag: 'Mythical' },
        { name: 'Stanley Parable Mega-Kills', tag: 'Mythical' },
        { name: 'Bastion Mega-Kills', tag: 'Mythical' },
        { name: 'GLaDOS Mega-Kills', tag: 'Mythical' }
      ]
    }
  },

  'courier': {
    slots: [
      { id: 'courier_ground', name: 'Ground Courier Model', icon: '🐴' },
      { id: 'courier_flying', name: 'Flying Courier Model', icon: '🦅' },
      { id: 'courier_fx', name: 'Unusual / Prismatic Aura', icon: '✨' }
    ],
    items: {
      'courier_ground': [
        { name: 'Golden Baby Roshan', tag: 'Immortal', best: true },
        { name: 'Platinum Baby Roshan', tag: 'Immortal' },
        { name: 'Amaterasu (Okami Mythical)', tag: 'Mythical' },
        { name: 'Hakobi and Ebisu (TI10 Gold)', tag: 'Immortal' },
        { name: 'Onibi (Final Style 21)', tag: 'Mythical' },
        { name: 'Doomling Courier', tag: 'Immortal' },
        { name: 'Faceless Rex', tag: 'Mythical' }
      ],
      'courier_flying': [
        { name: 'Golden Wings Baby Roshan', tag: 'Immortal', best: true },
        { name: 'Celestial Phoenix Courier', tag: 'Mythical' },
        { name: 'Flying Redpaw with Balloon', tag: 'Mythical' }
      ],
      'courier_fx': [
        { name: 'Prismatic: Midas Gold + Ethereal Flame', tag: 'Unusual', best: true },
        { name: 'Prismatic: Creator\'s Light + Trail of the Lotus', tag: 'Unusual' },
        { name: 'Prismatic: Rubiline + Bleak Hallucination', tag: 'Unusual' }
      ]
    }
  },

  'weather': {
    slots: [
      { id: 'weather_effect', name: 'Atmosphere Effect', icon: '🌦️' }
    ],
    items: {
      'weather_effect': [
        { name: 'Weather Ash (Volcanic Fallout & Embers)', tag: 'Mythical', best: true },
        { name: 'Weather Aurora (Northern Lights & Shimmer)', tag: 'Mythical' },
        { name: 'Weather Spring (Cherry Blossoms & Petals)', tag: 'Mythical' },
        { name: 'Weather Rain (Heavy Downpour & Thunder)', tag: 'Mythical' },
        { name: 'Weather Snow (Blizzard & Frost)', tag: 'Mythical' },
        { name: 'Weather Moonbeam (Mystic Night Radiance)', tag: 'Mythical' },
        { name: 'Weather Pestilence (Green Spores & Mist)', tag: 'Mythical' },
        { name: 'Weather Harvest (Golden Autumn Breeze)', tag: 'Mythical' },
        { name: 'Weather Sirocco (Desert Sandwind)', tag: 'Mythical' }
      ]
    }
  },

  'tower': {
    slots: [
      { id: 'radiant_tower', name: 'Radiant Towers', icon: '🏛️' },
      { id: 'dire_tower', name: 'Dire Towers', icon: '🏰' }
    ],
    items: {
      'radiant_tower': [
        { name: 'Living Towers (TI10 Reef Sentinel)', tag: 'Exclusive', best: true },
        { name: 'Gilded Altar of the Ancients (TI9)', tag: 'Immortal' },
        { name: 'Dragon Castle Radiant Spire', tag: 'Mythical' }
      ],
      'dire_tower': [
        { name: 'Decayed Spires of the Abyss (TI10)', tag: 'Exclusive', best: true },
        { name: 'Infernal Obsidian Towers (TI9)', tag: 'Immortal' },
        { name: 'Molten Core Dire Spire', tag: 'Mythical' }
      ]
    }
  },

  'roshan': {
    slots: [
      { id: 'roshan_model', name: 'Roshan Statue & Model', icon: '🐲' }
    ],
    items: {
      'roshan_model': [
        { name: 'Gingerbread Roshan (Frostivus Special)', tag: 'Immortal', best: true },
        { name: 'Honey Heist Baby Roshan', tag: 'Immortal' },
        { name: 'Dark Moon Baby Roshan', tag: 'Immortal' },
        { name: 'Lava Roshan (Diretide Special)', tag: 'Mythical' },
        { name: 'Ice Roshan (Aghanim\'s Labyrinth)', tag: 'Mythical' }
      ]
    }
  },

  'wards': {
    slots: [
      { id: 'observer_ward', name: 'Observer Ward', icon: '👁️' },
      { id: 'sentry_ward', name: 'Sentry Ward', icon: '🔵' }
    ],
    items: {
      'observer_ward': [
        { name: 'Watcher Below Ward', tag: 'Mythical', best: true },
        { name: 'Phoenix Ward of the Sun King', tag: 'Immortal' },
        { name: 'The Eye of Fountain Ward', tag: 'Rare' },
        { name: 'Schnitzel the Sentry Piglet', tag: 'Mythical' }
      ],
      'sentry_ward': [
        { name: 'Stone Bound True-Sight Totem', tag: 'Mythical', best: true },
        { name: 'Glacial Sentry Monolith', tag: 'Rare' }
      ]
    }
  },

  'cursor': {
    slots: [
      { id: 'cursor_pack', name: 'Cursor Skin Pack', icon: '🖱️' }
    ],
    items: {
      'cursor_pack': [
        { name: 'Crystal Maiden Frost Cursors', tag: 'Mythical', best: true },
        { name: 'Chaos Knight Armageddon Cursors', tag: 'Mythical' },
        { name: 'The International Golden Cursors', tag: 'Exclusive' },
        { name: 'Necrophos Rot Cursors', tag: 'Rare' },
        { name: 'Mirana Lunar Cursors', tag: 'Rare' },
        { name: 'Pudge Butcher Cursors', tag: 'Rare' }
      ]
    }
  },

  'huds': {
    slots: [
      { id: 'hud_skin', name: 'HUD Layout Skin', icon: '🖥️' }
    ],
    items: {
      'hud_skin': [
        { name: 'Black Monolith HUD', tag: 'Mythical', best: true },
        { name: 'Scythe of Vyse HUD Skin', tag: 'Mythical' },
        { name: 'Azure Constellation HUD', tag: 'Mythical' },
        { name: 'Dragon Scale HUD', tag: 'Rare' },
        { name: 'Crux of Electrum HUD', tag: 'Rare' },
        { name: 'Iron Cage Gothic HUD', tag: 'Rare' }
      ]
    }
  },

  'teleport': {
    slots: [
      { id: 'tp_effect', name: 'Teleport Scroll FX', icon: '🌀' }
    ],
    items: {
      'tp_effect': [
        { name: 'The International Champion Aegis Teleport', tag: 'Exclusive', best: true },
        { name: 'Battle Pass Level 1000 Golden TP', tag: 'Immortal' },
        { name: 'Aghanim\'s Labyrinth Dimensional Portal', tag: 'Mythical' },
        { name: 'Diretide Haunted Ghost Teleport', tag: 'Holiday' },
        { name: 'DPC Gold Tier Fan Club Teleport', tag: 'Rare' }
      ]
    }
  },

  'blink': {
    slots: [
      { id: 'blink_effect', name: 'Blink Dagger Particles', icon: '⚡' }
    ],
    items: {
      'blink_effect': [
        { name: 'The International Arcane Blink Burst', tag: 'Immortal', best: true },
        { name: 'Golden Dagger Flash of the Sunken King', tag: 'Golden' },
        { name: 'Overwhelming Blink Shockwave FX', tag: 'Mythical' },
        { name: 'Swift Blink Windstream Trail', tag: 'Mythical' }
      ]
    }
  },

  'river': {
    slots: [
      { id: 'river_vial', name: 'River Water Vial', icon: '🌊' }
    ],
    items: {
      'river_vial': [
        { name: 'Vial of Electric Blue Water', tag: 'Immortal', best: true },
        { name: 'Vial of Chrome Liquid Metal', tag: 'Immortal' },
        { name: 'Vial of Crimson Blood Water', tag: 'Mythical' },
        { name: 'Vial of Slime Acid Green', tag: 'Rare' },
        { name: 'Vial of Dry Cracked Riverbed', tag: 'Rare' }
      ]
    }
  }
};
