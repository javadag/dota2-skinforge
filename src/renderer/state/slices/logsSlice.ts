import type { StateCreator } from 'zustand'
import type { AppStoreState } from '../useAppStore'

export interface LogEntry {
  id: string
  time: string
  message: string
  type: 'info' | 'warn' | 'error' | 'success'
}

export interface LogsSlice {
  logs: LogEntry[]
  addLog: (message: string, type?: 'info' | 'warn' | 'error' | 'success') => void
}

export const createLogsSlice: StateCreator<AppStoreState, [], [], LogsSlice> = (set) => ({
  logs: [
    {
      id: 'init',
      time: new Date().toLocaleTimeString(),
      message: 'Dota 2 SkinForge initialized.',
      type: 'info'
    }
  ],

  addLog: (message, type = 'info') => {
    const time = new Date().toLocaleTimeString()
    console.log(`[SkinForge:${type}] ${message}`)
    set((state) => ({
      logs: [
        ...state.logs.slice(-200),
        {
          id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          time,
          message,
          type
        }
      ]
    }))
  }
})
