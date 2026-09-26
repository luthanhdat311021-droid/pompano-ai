'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { LIMITS, type IssueLevel, type Limits } from './telemetry'

// Farm management data (ponds, logs, settings) lives in the browser for now.
// Sensor readings come from the telemetry API; everything here is operator input.

export type Farm = { id: string; name: string }
export type Pond = { id: string; farmId: string; name: string; fish: number; area: number; stockedAt: string }
export type FeedLog = { id: string; pondId: string; kg: number; type: string; ts: number; note: string }
export type HealthCondition = 'good' | 'watch' | 'sick'
export type HealthLog = { id: string; pondId: string; dead: number; weight: number; condition: HealthCondition; ts: number; note: string }
export type ActivityKind = 'pond' | 'feed' | 'health' | 'alert' | 'system'
export type ActivityEntry = { id: string; kind: ActivityKind; text: string; ts: number; pondId?: string }
export type Notice = { id: string; key: string; title: string; detail: string; level: IssueLevel; pondId: string; ts: number; read: boolean }
export type Settings = { dark: boolean; limits: Limits; feedPrice: number; notifyWarnings: boolean }
export type Profile = { name: string; role: string }

export type FarmState = {
  farmId: string
  farms: Farm[]
  ponds: Pond[]
  feedLogs: FeedLog[]
  healthLogs: HealthLog[]
  activity: ActivityEntry[]
  notices: Notice[]
  acks: Record<string, number>
  issueKeys: string[]
  settings: Settings
  profile: Profile
  loggedIn: boolean
}

export const FEED_TYPES = ['Viên nổi 40% đạm', 'Viên nổi 35% đạm', 'Cá tạp xay']
export const CONDITION_LABEL: Record<HealthCondition, string> = { good: 'Khỏe mạnh', watch: 'Cần theo dõi', sick: 'Có dấu hiệu bệnh' }

const STORAGE_KEY = 'pompano-state-v1'
const DAY = 86_400_000
const MAX_ACTIVITY = 300
const MAX_NOTICES = 100

export function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return (words.slice(0, 2).map((word) => word[0]).join('') || '?').toUpperCase()
}

export function startOfDay(ts: number) {
  const date = new Date(ts)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function seed(now: number): FarmState {
  const ponds: Pond[] = [
    { id: 'A01', farmId: 'binh-minh', name: 'Ao A01', fish: 12500, area: 2500, stockedAt: '' },
    { id: 'A02', farmId: 'binh-minh', name: 'Ao A02', fish: 10200, area: 2000, stockedAt: '' },
    { id: 'A03', farmId: 'binh-minh', name: 'Ao A03', fish: 14800, area: 3200, stockedAt: '' },
    { id: 'A04', farmId: 'binh-minh', name: 'Ao A04', fish: 9600, area: 1800, stockedAt: '' },
    { id: 'B01', farmId: 'hoang-hon', name: 'Ao B01', fish: 8400, area: 1500, stockedAt: '' },
    { id: 'B02', farmId: 'hoang-hon', name: 'Ao B02', fish: 7600, area: 1400, stockedAt: '' },
  ].map((pond, index) => ({ ...pond, stockedAt: new Date(now - (92 - index * 6) * DAY).toISOString().slice(0, 10) }))

  const feedLogs: FeedLog[] = []
  const healthLogs: HealthLog[] = []
  const today = startOfDay(now)
  for (let day = 6; day >= 0; day--) {
    for (const pond of ponds) {
      for (const hour of [7, 16]) {
        const ts = today - day * DAY + hour * 3_600_000
        if (ts > now) continue
        const kg = Math.round((pond.fish * 0.0017 + (Math.random() - 0.5) * 3) * 10) / 10
        feedLogs.push({ id: uid(), pondId: pond.id, kg, type: FEED_TYPES[hour === 7 ? 0 : 1], ts, note: '' })
      }
      if (day % 3 === 0) {
        const ts = today - day * DAY + 9 * 3_600_000
        if (ts <= now) healthLogs.push({ id: uid(), pondId: pond.id, dead: 5 + Math.floor(Math.random() * 20), weight: Math.round(360 - day * 4 + Math.random() * 20), condition: pond.id === 'A02' && day === 0 ? 'watch' : 'good', ts, note: pond.id === 'A02' && day === 0 ? 'Cá bơi lờ đờ vào buổi trưa' : '' })
      }
    }
  }

  return {
    farmId: 'binh-minh',
    farms: [{ id: 'binh-minh', name: 'Trang trại Bình Minh' }, { id: 'hoang-hon', name: 'Trang trại Hoàng Hôn' }],
    ponds,
    feedLogs,
    healthLogs,
    activity: [{ id: uid(), kind: 'system', text: 'Khởi tạo dữ liệu mẫu cho hệ thống', ts: now }],
    notices: [],
    acks: {},
    issueKeys: [],
    settings: { dark: false, limits: LIMITS, feedPrice: 28000, notifyWarnings: true },
    profile: { name: 'Nguyễn Đại Phúc', role: 'Quản trị viên' },
    loggedIn: true,
  }
}

function load(): FarmState {
  const fresh = seed(Date.now())
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<FarmState> | null
    if (!saved) return fresh
    return { ...fresh, ...saved, settings: { ...fresh.settings, ...saved.settings }, profile: { ...fresh.profile, ...saved.profile } }
  } catch {
    return fresh
  }
}

type NewPond = Omit<Pond, 'farmId'>
type Actions = {
  setFarm: (farmId: string) => void
  addPond: (pond: NewPond) => void
  updatePond: (pond: NewPond) => void
  deletePond: (pondId: string) => void
  addFeed: (log: Omit<FeedLog, 'id'>) => void
  deleteFeed: (id: string) => void
  addHealth: (log: Omit<HealthLog, 'id'>) => void
  deleteHealth: (id: string) => void
  acknowledge: (keys: string[]) => void
  unacknowledge: (key: string) => void
  syncIssues: (keys: string[], fresh: Omit<Notice, 'id' | 'read'>[]) => void
  markRead: (ids?: string[]) => void
  clearActivity: () => void
  updateSettings: (settings: Partial<Settings>) => void
  updateProfile: (profile: Profile) => void
  setLoggedIn: (loggedIn: boolean) => void
  reset: () => void
}

type FarmContextValue = FarmState & Actions & { farm: Farm; farmPonds: Pond[] }

const FarmContext = createContext<FarmContextValue | null>(null)

function withActivity(state: FarmState, entry: Omit<ActivityEntry, 'id' | 'ts'>): FarmState {
  return { ...state, activity: [{ ...entry, id: uid(), ts: Date.now() }, ...state.activity].slice(0, MAX_ACTIVITY) }
}

function pondName(state: FarmState, pondId: string) {
  return state.ponds.find((pond) => pond.id === pondId)?.name ?? `Ao ${pondId}`
}

export function FarmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FarmState | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)

  const latestState = useRef<FarmState | null>(null)

  useEffect(() => { setState(load()) }, [])

  useEffect(() => {
    if (!state) return
    latestState.current = state
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
    }, 300)
  }, [state])

  // Flush a pending debounced save when the tab is closed or hidden.
  useEffect(() => {
    const flush = () => {
      window.clearTimeout(saveTimer.current)
      try { if (latestState.current) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(latestState.current)) } catch {}
    }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [])

  const update = useCallback((fn: (prev: FarmState) => FarmState) => setState((prev) => (prev ? fn(prev) : prev)), [])

  const actions = useMemo<Actions>(() => ({
    setFarm: (farmId) => update((s) => withActivity({ ...s, farmId }, { kind: 'system', text: `Chuyển sang ${s.farms.find((farm) => farm.id === farmId)?.name ?? farmId}` })),
    addPond: (pond) => update((s) => withActivity({ ...s, ponds: [...s.ponds, { ...pond, farmId: s.farmId }] }, { kind: 'pond', text: `Thêm ${pond.name} (${pond.fish.toLocaleString('en-US')} con, ${pond.area.toLocaleString('en-US')} m²)`, pondId: pond.id })),
    updatePond: (pond) => update((s) => withActivity({ ...s, ponds: s.ponds.map((item) => (item.id === pond.id ? { ...item, ...pond } : item)) }, { kind: 'pond', text: `Cập nhật thông tin ${pond.name}`, pondId: pond.id })),
    deletePond: (pondId) => update((s) => withActivity({
      ...s,
      ponds: s.ponds.filter((pond) => pond.id !== pondId),
      feedLogs: s.feedLogs.filter((log) => log.pondId !== pondId),
      healthLogs: s.healthLogs.filter((log) => log.pondId !== pondId),
    }, { kind: 'pond', text: `Xóa ${pondName(s, pondId)} và toàn bộ nhật ký liên quan`, pondId })),
    addFeed: (log) => update((s) => withActivity({ ...s, feedLogs: [...s.feedLogs, { ...log, id: uid() }] }, { kind: 'feed', text: `Cho ăn ${log.kg} kg ${log.type.toLowerCase()} tại ${pondName(s, log.pondId)}`, pondId: log.pondId })),
    deleteFeed: (id) => update((s) => {
      const log = s.feedLogs.find((item) => item.id === id)
      const next = { ...s, feedLogs: s.feedLogs.filter((item) => item.id !== id) }
      return log ? withActivity(next, { kind: 'feed', text: `Xóa bản ghi cho ăn ${log.kg} kg tại ${pondName(s, log.pondId)}`, pondId: log.pondId }) : next
    }),
    addHealth: (log) => update((s) => withActivity({
      ...s,
      healthLogs: [...s.healthLogs, { ...log, id: uid() }],
      ponds: s.ponds.map((pond) => (pond.id === log.pondId ? { ...pond, fish: Math.max(0, pond.fish - log.dead) } : pond)),
    }, { kind: 'health', text: `Kiểm tra sức khỏe ${pondName(s, log.pondId)}: ${CONDITION_LABEL[log.condition].toLowerCase()}, ${log.dead} cá chết, TB ${log.weight} g/con`, pondId: log.pondId })),
    deleteHealth: (id) => update((s) => {
      const log = s.healthLogs.find((item) => item.id === id)
      if (!log) return s
      return withActivity({
        ...s,
        healthLogs: s.healthLogs.filter((item) => item.id !== id),
        ponds: s.ponds.map((pond) => (pond.id === log.pondId ? { ...pond, fish: pond.fish + log.dead } : pond)),
      }, { kind: 'health', text: `Xóa bản ghi sức khỏe tại ${pondName(s, log.pondId)}`, pondId: log.pondId })
    }),
    acknowledge: (keys) => update((s) => {
      const fresh = keys.filter((key) => !s.acks[key])
      if (!fresh.length) return s
      const now = Date.now()
      return withActivity({ ...s, acks: { ...s.acks, ...Object.fromEntries(fresh.map((key) => [key, now])) } }, { kind: 'alert', text: fresh.length === 1 ? `Xác nhận đã xử lý cảnh báo ${fresh[0]}` : `Xác nhận đã xử lý ${fresh.length} cảnh báo` })
    }),
    unacknowledge: (key) => update((s) => {
      const acks = { ...s.acks }
      delete acks[key]
      return withActivity({ ...s, acks }, { kind: 'alert', text: `Mở lại cảnh báo ${key}` })
    }),
    syncIssues: (keys, fresh) => update((s) => {
      const acks = Object.fromEntries(Object.entries(s.acks).filter(([key]) => keys.includes(key)))
      const notices = fresh.map((notice) => ({ ...notice, id: uid(), read: false }))
      let next: FarmState = { ...s, issueKeys: keys, acks, notices: [...notices, ...s.notices].slice(0, MAX_NOTICES) }
      for (const notice of notices) next = withActivity(next, { kind: 'alert', text: `${pondName(s, notice.pondId)} · ${notice.title}: ${notice.detail}`, pondId: notice.pondId })
      return next
    }),
    markRead: (ids) => update((s) => ({ ...s, notices: s.notices.map((notice) => (!ids || ids.includes(notice.id) ? { ...notice, read: true } : notice)) })),
    clearActivity: () => update((s) => withActivity({ ...s, activity: [] }, { kind: 'system', text: 'Xóa lịch sử hoạt động' })),
    updateSettings: (settings) => update((s) => {
      let next: FarmState = { ...s, settings: { ...s.settings, ...settings } }
      if (settings.limits) next = withActivity(next, { kind: 'system', text: 'Cập nhật ngưỡng cảnh báo' })
      if (settings.feedPrice !== undefined) next = withActivity(next, { kind: 'system', text: `Cập nhật giá thức ăn: ${settings.feedPrice.toLocaleString('en-US')} đ/kg` })
      return next
    }),
    updateProfile: (profile) => update((s) => withActivity({ ...s, profile }, { kind: 'system', text: 'Cập nhật hồ sơ cá nhân' })),
    setLoggedIn: (loggedIn) => update((s) => withActivity({ ...s, loggedIn }, { kind: 'system', text: loggedIn ? 'Đăng nhập hệ thống' : 'Đăng xuất khỏi hệ thống' })),
    reset: () => {
      try { window.localStorage.removeItem(STORAGE_KEY) } catch {}
      setState(seed(Date.now()))
    },
  }), [update])

  const value = useMemo(() => {
    if (!state) return null
    const farm = state.farms.find((item) => item.id === state.farmId) ?? state.farms[0]
    return { ...state, ...actions, farm, farmPonds: state.ponds.filter((pond) => pond.farmId === farm.id) }
  }, [state, actions])

  if (!value) return null
  return <FarmContext.Provider value={value}>{children}</FarmContext.Provider>
}

export function useFarm() {
  const value = useContext(FarmContext)
  if (!value) throw new Error('useFarm must be used inside FarmProvider')
  return value
}
