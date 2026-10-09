export interface AppConfig {
  name: string
  shortName: string
  modFolder: string
  version: string
  displayVersion: string
  tagline: string
  description: string
}

export const APP_CONFIG: AppConfig = {
  name: 'Dota 2 SkinForge',
  shortName: 'SkinForge',
  modFolder: 'skinforge',
  version: '1.0.0',
  displayVersion: 'v1.0',
  tagline: 'Cosmetic Suite',
  description: 'Local Dota 2 cosmetic suite via VPK modding'
}

export default APP_CONFIG
