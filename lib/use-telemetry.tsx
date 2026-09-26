'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { LIMITS, MAX_HISTORY, pondIssues, type Issue, type Limits, type Reading, type Snapshot } from './telemetry'

type Telemetry = {
  latest: Record<string, Reading>
  history: Record<string, Reading[]>
  issues: Issue[]
  connected: boolean
  now: number
  reload: () => Promise<void>
}

const TelemetryContext = createContext<Telemetry>({ latest: {}, history: {}, issues: [], connected: false, now: 0, reload: async () => {} })

export function TelemetryProvider({ children, limits = LIMITS }: { children: React.ReactNode; limits?: Limits }) {
  const [latest, setLatest] = useState<Record<string, Reading>>({})
  const [history, setHistory] = useState<Record<string, Reading[]>>({})
  const [connected, setConnected] = useState(false)
  const [now, setNow] = useState(0)

  const applySnapshot = useCallback((data: Snapshot) => {
    setLatest(Object.fromEntries(data.latest.map((reading) => [reading.pondId, reading])))
    setHistory(data.history)
  }, [])

  useEffect(() => {
    const source = new EventSource('/api/telemetry/stream')
    source.onopen = () => setConnected(true)
    source.onerror = () => setConnected(false)
    source.addEventListener('snapshot', (event) => applySnapshot(JSON.parse((event as MessageEvent).data) as Snapshot))
    source.addEventListener('reading', (event) => {
      const reading = JSON.parse((event as MessageEvent).data) as Reading
      setLatest((prev) => ({ ...prev, [reading.pondId]: reading }))
      setHistory((prev) => ({ ...prev, [reading.pondId]: [...(prev[reading.pondId] ?? []), reading].slice(-MAX_HISTORY) }))
    })
    setNow(Date.now())
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    return () => { source.close(); window.clearInterval(tick) }
  }, [applySnapshot])

  const reload = useCallback(async () => {
    const response = await fetch('/api/telemetry', { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    applySnapshot(await response.json())
    setNow(Date.now())
  }, [applySnapshot])

  const issues = useMemo(() => Object.values(latest).flatMap((reading) => pondIssues(reading.pondId, reading, now, limits)), [latest, now, limits])
  const value = useMemo(() => ({ latest, history, issues, connected, now, reload }), [latest, history, issues, connected, now, reload])

  return <TelemetryContext.Provider value={value}>{children}</TelemetryContext.Provider>
}

export function useTelemetry() {
  return useContext(TelemetryContext)
}
