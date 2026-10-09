export interface AppConfig {
  name: string
  shortName: string
  modFolder: string
  version: string
  displayVersion: string
  tagline: string
  description: string
  cdnUrl: string
}

export const APP_CONFIG: AppConfig = {
  name: 'Dota 2 SkinForge',
  shortName: 'SkinForge',
  modFolder: 'skinforge',
  version: '1.0.0',
  displayVersion: 'v1.0',
  tagline: 'Cosmetic Suite',
  description: 'Local Dota 2 cosmetic suite via VPK modding',
  cdnUrl: 'https://pub-0e63b59220954d098346c54bdc0b2563.r2.dev'
}

export default APP_CONFIG
