import { ChevronUp } from 'lucide-react'
import React, { useEffect, useRef } from 'react'
import { useAppStore } from '../state/useAppStore'

export const ConsoleFooter: React.FC = () => {
  const logs = useAppStore((s) => s.logs)
  const isConsoleOpen = useAppStore((s) => s.isConsoleOpen)
  const toggleConsole = useAppStore((s) => s.toggleConsole)
  const logContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  const latestLog = logs.length > 0 ? logs[logs.length - 1].message : 'Ready'

  return (
    <footer className="relative w-full shrink-0 z-20 bg-[#0a0d14]/95 border-t border-white/5 backdrop-blur-md flex flex-col transition-all">
      <div
        id="consoleToggle"
        className="flex items-center gap-2.5 px-5 py-2 cursor-pointer text-[11px] font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors select-none"
        onClick={toggleConsole}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#06b6d4] shrink-0" />
        <span className="text-[10px] font-bold tracking-wider text-slate-400">ACTIVITY LOG</span>
        <span id="cfStatus" className="flex-1 font-mono text-[11px] text-slate-400 truncate">
          {latestLog}
        </span>
        <ChevronUp
          id="cfChevron"
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isConsoleOpen ? 'rotate-180' : ''}`}
        />
      </div>

      <div
        id="consoleBody"
        className={`overflow-hidden transition-all duration-300 ${isConsoleOpen ? 'h-32.5 border-t border-white/5' : 'h-0'}`}
      >
        <div
          id="logOutput"
          ref={logContainerRef}
          className="h-full overflow-y-auto px-5 py-2.5 font-mono text-[11px] flex flex-col gap-1"
        >
          {logs.map((entry) => (
            <div
              key={entry.id}
              className={`flex items-start gap-2 leading-relaxed ${
                entry.type === 'error'
                  ? 'text-rose-400'
                  : entry.type === 'warn'
                    ? 'text-amber-300'
                    : entry.type === 'success'
                      ? 'text-emerald-300'
                      : 'text-slate-400'
              }`}
            >
              <span className="opacity-60">[{entry.time}]</span>
              <span>{entry.message}</span>
            </div>
          ))}
        </div>
      </div>
    </footer>
  )
}
