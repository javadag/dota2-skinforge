/**
 * Dota 2 SkinForge — Launch Options & Steam Command Line Flags
 */

export interface LaunchOptionsSettings {
  novid: boolean
  map: boolean
  high: boolean
  console: boolean
  nojoy: boolean
  dx11: boolean
  customArgs?: string
}

export const DEFAULT_LAUNCH_OPTIONS: LaunchOptionsSettings = {
  novid: true,
  map: true,
  high: true,
  console: false,
  nojoy: true,
  dx11: false,
  customArgs: ''
}

export function buildLaunchArgsString(options?: Partial<LaunchOptionsSettings>): string {
  const opts = { ...DEFAULT_LAUNCH_OPTIONS, ...(options || {}) }
  const flags: string[] = []
  if (opts.novid) flags.push('-novid')
  if (opts.map) flags.push('-map dota')
  if (opts.high) flags.push('-high')
  if (opts.console) flags.push('-console')
  if (opts.nojoy) flags.push('-nojoy')
  if (opts.dx11) flags.push('-dx11')
  if (opts.customArgs && opts.customArgs.trim()) {
    flags.push(opts.customArgs.trim())
  }
  return flags.join(' ')
}
