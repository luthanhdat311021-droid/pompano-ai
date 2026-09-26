// Shared telemetry types and rules — used by the API routes and the dashboard.

export type Reading = {
  deviceId: string
  pondId: string
  ph: number
  temp: number
  oxygen: number
  ts: number
}

export type Snapshot = {
  latest: Reading[]
  history: Record<string, Reading[]>
}

export type IssueLevel = 'danger' | 'warning' | 'info'

export type Issue = {
  pondId: string
  metric: 'ph' | 'temp' | 'oxygen' | 'offline'
  level: IssueLevel
  title: string
  detail: string
  value: string
  ts: number
}

export type PondStatus = { label: string; tone: 'green' | 'amber' | 'red' | 'blue' }

// ~1 hour per pond at one reading every 2 seconds.
export const MAX_HISTORY = 1800
export const OFFLINE_AFTER_MS = 10_000

export type Limits = {
  ph: { min: number; max: number; dangerMin: number; dangerMax: number }
  temp: { min: number; max: number; dangerMin: number; dangerMax: number }
  oxygen: { min: number; dangerMin: number }
}

export const LIMITS: Limits = {
  ph: { min: 7.5, max: 8.5, dangerMin: 7, dangerMax: 9 },
  temp: { min: 26, max: 30, dangerMin: 24, dangerMax: 32 },
  oxygen: { min: 5, dangerMin: 4 },
}

export function issueKey(issue: Pick<Issue, 'pondId' | 'metric'>) {
  return `${issue.pondId}-${issue.metric}`
}

export function parseReading(input: unknown): Reading | null {
  if (!input || typeof input !== 'object') return null
  const body = input as Record<string, unknown>
  const pondId = typeof body.pondId === 'string' ? body.pondId.trim().toUpperCase() : ''
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim().slice(0, 64) : ''
  const ph = Number(body.ph)
  const temp = Number(body.temp)
  const oxygen = Number(body.oxygen)
  if (!/^[A-Z]\d{2}$/.test(pondId) || !deviceId) return null
  if (!Number.isFinite(ph) || ph < 0 || ph > 14) return null
  if (!Number.isFinite(temp) || temp < -5 || temp > 60) return null
  if (!Number.isFinite(oxygen) || oxygen < 0 || oxygen > 20) return null
  // Boards without an RTC send no timestamp; the server clock is authoritative.
  return { deviceId, pondId, ph, temp, oxygen, ts: Date.now() }
}

export function pondIssues(pondId: string, reading: Reading | undefined, now: number, limits: Limits = LIMITS): Issue[] {
  if (!reading) return []
  const silentFor = now - reading.ts
  if (silentFor > OFFLINE_AFTER_MS) {
    return [{ pondId, metric: 'offline', level: 'info', title: 'Mất tín hiệu cảm biến', detail: `${reading.deviceId} không gửi dữ liệu trong ${Math.round(silentFor / 1000)} giây`, value: '—', ts: reading.ts }]
  }
  const issues: Issue[] = []
  const { ph, temp, oxygen } = reading
  if (ph < limits.ph.min || ph > limits.ph.max) {
    issues.push({ pondId, metric: 'ph', level: ph < limits.ph.dangerMin || ph > limits.ph.dangerMax ? 'danger' : 'warning', title: ph > limits.ph.max ? 'pH cao' : 'pH thấp', detail: `Giá trị hiện tại ${ph.toFixed(2)}, ngưỡng an toàn ${limits.ph.min} – ${limits.ph.max}`, value: ph.toFixed(2), ts: reading.ts })
  }
  if (temp < limits.temp.min || temp > limits.temp.max) {
    issues.push({ pondId, metric: 'temp', level: temp < limits.temp.dangerMin || temp > limits.temp.dangerMax ? 'danger' : 'warning', title: temp > limits.temp.max ? 'Nhiệt độ cao' : 'Nhiệt độ thấp', detail: `Giá trị hiện tại ${temp.toFixed(1)}°C, ngưỡng an toàn ${limits.temp.min} – ${limits.temp.max}°C`, value: `${temp.toFixed(1)}°C`, ts: reading.ts })
  }
  if (oxygen < limits.oxygen.min) {
    issues.push({ pondId, metric: 'oxygen', level: oxygen < limits.oxygen.dangerMin ? 'danger' : 'warning', title: 'Oxy hòa tan thấp', detail: `Giá trị hiện tại ${oxygen.toFixed(2)} mg/L, tối thiểu ${limits.oxygen.min} mg/L`, value: `${oxygen.toFixed(2)} mg/L`, ts: reading.ts })
  }
  return issues
}

export function pondStatus(reading: Reading | undefined, issues: Issue[]): PondStatus {
  if (!reading) return { label: 'Chờ dữ liệu', tone: 'blue' }
  if (issues.some((issue) => issue.metric === 'offline')) return { label: 'Mất kết nối', tone: 'red' }
  if (issues.some((issue) => issue.level === 'danger')) return { label: 'Nguy hiểm', tone: 'red' }
  if (issues.length) return { label: 'Cảnh báo', tone: 'amber' }
  return { label: 'Bình thường', tone: 'green' }
}

export function timeAgo(ts: number, now: number) {
  const seconds = Math.max(0, Math.round((now - ts) / 1000))
  if (seconds < 60) return `${seconds} giây trước`
  const minutes = Math.round(seconds / 60)
  return minutes < 60 ? `${minutes} phút trước` : `${Math.round(minutes / 60)} giờ trước`
}
