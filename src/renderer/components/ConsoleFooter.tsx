import React, { useRef, useEffect } from 'react'
import { ChevronUp } from 'lucide-react'
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
    <footer className={`console-footer ${isConsoleOpen ? 'open' : ''}`}>
      <div id="consoleToggle" className="cf-toggle" onClick={toggleConsole}>
        <span className="cf-pulse" />
        <span className="cf-label">ACTIVITY LOG</span>
        <span id="cfStatus" className="cf-status">
          {latestLog}
        </span>
        <ChevronUp id="cfChevron" className="cf-chevron" />
      </div>

      <div id="consoleBody" className="cf-body">
        <div id="logOutput" ref={logContainerRef} className="cf-log">
          {logs.map((entry) => (
            <div key={entry.id} className={`log-line ${entry.type}`}>
              <span className="ll-time">[{entry.time}]</span>
              <span>{entry.message}</span>
            </div>
          ))}
        </div>
      </div>
    </footer>
  )
}
