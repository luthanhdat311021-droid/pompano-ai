'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FarmProvider, useFarm, type Notice } from '@/lib/farm-store'
import { issueKey } from '@/lib/telemetry'
import { TelemetryProvider, useTelemetry } from '@/lib/use-telemetry'
import { AIPage } from './_components/ai-page'
import { Dashboard } from './_components/dashboard'
import { FormHost } from './_components/forms'
import { FeedPage, HealthPage, PondDetail, PondsPage } from './_components/pages-manage'
import { ActivityPage, AlertsPage, IotPage, NotificationsPage, ReportsPage } from './_components/pages-monitor'
import { SettingsPage } from './_components/settings'
import { BottomNav, Header, LoginScreen, MobileDrawer, PageHeader, Sidebar } from './_components/shell'
import { AppUIContext, ConfirmDialog, Toast, type ConfirmRequest, type FormRequest, type RangeKey } from './_components/ui'

// An issue counts as resolved only after it has been absent this long, so values
// hovering around a threshold don't produce a new notification on every reading.
const ISSUE_CLEAR_MS = 120_000

function IssueWatcher() {
  const { issues, now } = useTelemetry()
  const { ponds, issueKeys, syncIssues, settings } = useFarm()
  const lastSeen = useRef<Map<string, number> | null>(null)

  useEffect(() => {
    if (!now) return
    if (!lastSeen.current) lastSeen.current = new Map(issueKeys.map((key) => [key, now]))
    const seen = lastSeen.current
    const known = new Set(ponds.map((pond) => pond.id))
    const fresh: Omit<Notice, 'id' | 'read'>[] = []
    for (const issue of issues) {
      if (!known.has(issue.pondId)) continue
      const key = issueKey(issue)
      if (!seen.has(key) && (settings.notifyWarnings || issue.level !== 'warning')) fresh.push({ key, title: issue.title, detail: issue.detail, level: issue.level, pondId: issue.pondId, ts: now })
      seen.set(key, now)
    }
    for (const [key, ts] of seen) if (now - ts > ISSUE_CLEAR_MS) seen.delete(key)
    const keys = Array.from(seen.keys()).sort()
    if (fresh.length || keys.join('|') !== [...issueKeys].sort().join('|')) syncIssues(keys, fresh)
  }, [issues, now, ponds, issueKeys, syncIssues, settings.notifyWarnings])

  return null
}

function CurrentPage({ active }: { active: string }) {
  if (active.startsWith('pond:')) return <PondDetail pondId={active.slice(5)} />
  switch (active) {
    case 'Ao nuôi': return <PondsPage />
    case 'Sức khỏe cá': return <HealthPage />
    case 'Thức ăn': return <FeedPage />
    case 'IoT & Cảm biến': return <IotPage />
    case 'Cảnh báo': return <AlertsPage />
    case 'AI phân tích': return <AIPage />
    case 'Báo cáo': return <ReportsPage />
    case 'Lịch sử hoạt động': return <ActivityPage />
    case 'Thông báo': return <NotificationsPage />
    case 'Cài đặt': return <SettingsPage />
    default: return <Dashboard />
  }
}

function App() {
  const { settings, loggedIn } = useFarm()
  const [active, setActive] = useState('Tổng quan')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [range, setRange] = useState<RangeKey>('15m')
  const [toast, setToast] = useState('')
  const [form, setForm] = useState<FormRequest | null>(null)
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  const navigate = useCallback((page: string) => {
    setActive(page)
    setMobileMenu(false)
    window.scrollTo({ top: 0 })
  }, [])
  const notify = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2600)
  }, [])
  const ui = useMemo(() => ({ active, navigate, notify, openForm: setForm, confirm: setConfirmRequest, range, setRange }), [active, navigate, notify, range])

  return <AppUIContext.Provider value={ui}>
    <div className={`app-shell ${settings.dark ? 'dark' : ''}`}>
      {loggedIn ? <>
        <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
        <div className="main-shell"><Header onOpenMobile={() => setMobileMenu(true)} /><main className="main-content"><PageHeader /><CurrentPage active={active} /></main></div>
        {mobileMenu && <MobileDrawer onClose={() => setMobileMenu(false)} />}
        <BottomNav onMore={() => setMobileMenu(true)} />
        {form && <FormHost form={form} onClose={() => setForm(null)} />}
        {confirmRequest && <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />}
      </> : <LoginScreen />}
      {toast && <Toast message={toast} />}
      <div id="overlay-root" />
    </div>
  </AppUIContext.Provider>
}

function WithTelemetry() {
  const { settings } = useFarm()
  return <TelemetryProvider limits={settings.limits}><IssueWatcher /><App /></TelemetryProvider>
}

export default function Page() {
  return <FarmProvider><WithTelemetry /></FarmProvider>
}
