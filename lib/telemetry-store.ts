import { MAX_HISTORY, type Reading, type Snapshot } from './telemetry'

// In-memory store for the dev server. Kept on globalThis so hot reloads don't wipe it.
// Swap this for a database (Postgres/Timescale, InfluxDB, …) when going to production.
type Store = {
  latest: Map<string, Reading>
  history: Map<string, Reading[]>
  listeners: Set<(reading: Reading) => void>
}

const globalStore = globalThis as unknown as { __pompanoTelemetry?: Store }

const store: Store = globalStore.__pompanoTelemetry ?? (globalStore.__pompanoTelemetry = { latest: new Map(), history: new Map(), listeners: new Set() })

export function ingest(reading: Reading) {
  store.latest.set(reading.pondId, reading)
  const history = store.history.get(reading.pondId) ?? []
  history.push(reading)
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY)
  store.history.set(reading.pondId, history)
  store.listeners.forEach((listener) => listener(reading))
}

export function snapshot(): Snapshot {
  return { latest: Array.from(store.latest.values()), history: Object.fromEntries(store.history) }
}

export function subscribe(listener: (reading: Reading) => void) {
  store.listeners.add(listener)
  return () => { store.listeners.delete(listener) }
}
