export interface AppConfig {
  name: string
  shortName: string
  modFolder: string
  version: string
  displayVersion: string
  tagline: string
  description: string
  cdnUrl: string
  /**
   * HTTPS endpoint of the bug-report relay (`workers/bug-report`). Public by design: it holds no
   * secret. Leave empty until the Worker is deployed; the in-app form then reports "not configured".
   */
  bugReportUrl: string
}

export const APP_CONFIG: AppConfig = {
  name: 'Dota 2 SkinForge',
  shortName: 'SkinForge',
  modFolder: 'skinforge',
  version: '1.3.2',
  displayVersion: 'v1.3.2',
  tagline: 'Cosmetic Suite',
  description: 'Local Dota 2 cosmetic suite via VPK modding',
  cdnUrl: 'https://pub-0e63b59220954d098346c54bdc0b2563.r2.dev',
  bugReportUrl: 'https://skinforge-bug-report.j-aghebati93.workers.dev'
}

export default APP_CONFIG
