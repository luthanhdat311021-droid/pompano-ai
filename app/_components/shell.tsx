'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, Bell, BrainCircuit, ChevronDown, ChevronRight, Clock3, CloudSun, FileBarChart, Fish, HeartPulse, LayoutDashboard, Leaf, LogIn, LogOut, Menu as MenuIcon, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, Radio, RefreshCw, Search, Settings, UserRound, Utensils, Waves, X } from 'lucide-react'
import { initials, useFarm } from '@/lib/farm-store'
import { OFFLINE_AFTER_MS, timeAgo } from '@/lib/telemetry'
import { useTelemetry } from '@/lib/use-telemetry'
import { alertIcon, useFarmIssues } from './shared'
import { Logo, Menu, Modal, Popover, RANGES, useAppUI, type MenuItem, type RangeKey } from './ui'

export const menuGroups = [
  { label: 'TỔNG QUAN', items: [{ label: 'Tổng quan', icon: LayoutDashboard }] },
  { label: 'QUẢN LÝ NUÔI', items: [
    { label: 'Ao nuôi', icon: Waves },
    { label: 'Sức khỏe cá', icon: Fish },
    { label: 'Thức ăn', icon: Utensils },
  ] },
  { label: 'GIÁM SÁT', items: [
    { label: 'IoT & Cảm biến', icon: Radio },
    { label: 'Cảnh báo', icon: AlertTriangle },
    { label: 'AI phân tích', icon: BrainCircuit },
  ] },
  { label: 'BÁO CÁO', items: [
    { label: 'Báo cáo', icon: FileBarChart },
    { label: 'Lịch sử hoạt động', icon: Activity },
  ] },
]

const allPages = [...menuGroups.flatMap((group) => group.items), { label: 'Thông báo', icon: Bell }, { label: 'Cài đặt', icon: Settings }]

const PAGE_DESCRIPTION: Record<string, string> = {
  'Ao nuôi': 'Quản lý danh sách ao, số lượng cá và trạng thái môi trường.',
  'Sức khỏe cá': 'Theo dõi tỷ lệ sống, cá chết và trọng lượng trung bình.',
  'Thức ăn': 'Ghi nhận lượng thức ăn, chi phí và hiệu quả cho ăn.',
  'IoT & Cảm biến': 'Trạng thái kết nối và giá trị trực tiếp của các thiết bị ESP32.',
  'Cảnh báo': 'Các chỉ số vượt ngưỡng an toàn và lịch sử cảnh báo.',
  'AI phân tích': 'Phân tích dữ liệu và gợi ý vận hành từ Pompano AI.',
  'Báo cáo': 'Tổng hợp số liệu môi trường, thức ăn và sức khỏe theo kỳ.',
  'Lịch sử hoạt động': 'Nhật ký thao tác và sự kiện trong hệ thống.',
  'Thông báo': 'Thông báo từ hệ thống cảnh báo.',
  'Cài đặt': 'Hồ sơ, giao diện, ngưỡng cảnh báo và dữ liệu.',
}

export function usePageTitle(active: string) {
  const { ponds } = useFarm()
  if (active.startsWith('pond:')) {
    const id = active.slice(5)
    return ponds.find((pond) => pond.id === id)?.name ?? `Ao ${id}`
  }
  return active
}

export function useAlertBadge() {
  const { open } = useFarmIssues()
  return open.length ? String(open.length) : undefined
}

function useUnreadCount() {
  const { notices } = useFarm()
  return notices.filter((notice) => !notice.read).length
}

function FarmMenu({ variant, collapsed }: { variant: 'sidebar' | 'header'; collapsed?: boolean }) {
  const { farms, farm, setFarm, ponds } = useFarm()
  const { notify, navigate, active } = useAppUI()
  const items: MenuItem[] = farms.map((item) => ({
    label: item.name,
    hint: `${ponds.filter((pond) => pond.farmId === item.id).length} ao`,
    checked: item.id === farm.id,
    onSelect: () => {
      if (item.id === farm.id) return
      setFarm(item.id)
      notify(`Đã chuyển sang ${item.name}`)
      if (active.startsWith('pond:')) navigate('Ao nuôi')
    },
  }))
  if (variant === 'header') return <Menu label="Chọn trang trại" triggerClassName="farm-header-select" align="right" width={250} trigger={<><Leaf /> <span>{farm.name}</span><ChevronDown /></>} items={items} />
  return <Menu label="Chọn trang trại" triggerClassName="farm-switcher" align="left" width={230} trigger={<><div className="farm-icon"><Leaf /></div>{!collapsed && <div className="farm-copy"><span>TRANG TRẠI ĐANG CHỌN</span><strong>{farm.name}</strong></div>}{!collapsed && <ChevronDown className="chevron" />}</>} items={items} />
}

function useProfileItems(): MenuItem[] {
  const { settings, updateSettings, setLoggedIn } = useFarm()
  const { navigate } = useAppUI()
  return [
    { label: 'Hồ sơ & cài đặt', icon: UserRound, onSelect: () => navigate('Cài đặt') },
    { label: 'Thông báo', icon: Bell, onSelect: () => navigate('Thông báo') },
    { label: settings.dark ? 'Chế độ sáng' : 'Chế độ tối', icon: CloudSun, onSelect: () => updateSettings({ dark: !settings.dark }) },
    'separator',
    { label: 'Đăng xuất', icon: LogOut, danger: true, onSelect: () => setLoggedIn(false) },
  ]
}

export function Sidebar({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (value: boolean) => void }) {
  const { active, navigate } = useAppUI()
  const { profile } = useFarm()
  const alertBadge = useAlertBadge()
  const unread = useUnreadCount()
  const profileItems = useProfileItems()
  const current = active.startsWith('pond:') ? 'Ao nuôi' : active
  return <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
    <div className="sidebar-top"><Logo compact={collapsed} /><button className="icon-button collapse-button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button></div>
    <FarmMenu variant="sidebar" collapsed={collapsed} />
    <nav className="main-nav">{menuGroups.map((group) => <div className="nav-group" key={group.label}><span className="nav-label">{!collapsed && group.label}</span>{group.items.map((item) => { const Icon = item.icon; const badge = item.label === 'Cảnh báo' ? alertBadge : undefined; return <button key={item.label} className={`nav-item ${current === item.label ? 'active' : ''}`} onClick={() => navigate(item.label)} title={collapsed ? item.label : undefined}><Icon /><span>{!collapsed && item.label}</span>{!collapsed && badge && <b>{badge}</b>}</button> })}</div>)}</nav>
    <div className="sidebar-bottom"><button className={`nav-item ${active === 'Thông báo' ? 'active' : ''}`} onClick={() => navigate('Thông báo')} title={collapsed ? 'Thông báo' : undefined}><Bell /><span>{!collapsed && 'Thông báo'}</span>{!collapsed && unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}</button><button className={`nav-item ${active === 'Cài đặt' ? 'active' : ''}`} onClick={() => navigate('Cài đặt')} title={collapsed ? 'Cài đặt' : undefined}><Settings /><span>{!collapsed && 'Cài đặt'}</span></button><div className="profile-row"><div className="avatar">{initials(profile.name)}</div>{!collapsed && <div className="profile-copy"><strong>{profile.name}</strong><span>{profile.role}</span></div>}{!collapsed && <Menu label="Tài khoản" align="left" width={210} trigger={<MoreHorizontal />} items={profileItems} />}</div></div>
  </aside>
}

function NotificationBell() {
  const { notices, markRead, ponds } = useFarm()
  const { navigate } = useAppUI()
  const { now } = useTelemetry()
  const unread = notices.filter((notice) => !notice.read)
  return <Popover label="Thông báo" triggerClassName="icon-button notification-button" width={330} trigger={<><Bell />{unread.length > 0 && <span />}</>}>{(close) => <div className="notice-panel">
    <div className="notice-head"><strong>Thông báo {unread.length > 0 && <em>{unread.length} mới</em>}</strong>{unread.length > 0 && <button type="button" className="text-button" onClick={() => markRead()}>Đánh dấu đã đọc</button>}</div>
    <div className="notice-list">{notices.length ? notices.slice(0, 6).map((notice) => { const Icon = alertIcon[notice.key.split('-')[1] as keyof typeof alertIcon] ?? Bell; return <button type="button" key={notice.id} className={`notice-item ${notice.level} ${notice.read ? '' : 'unread'}`} onClick={() => { markRead([notice.id]); close(); navigate(`pond:${notice.pondId}`) }}><span className="alert-symbol"><Icon /></span><span><strong>{ponds.find((pond) => pond.id === notice.pondId)?.name ?? `Ao ${notice.pondId}`} · {notice.title}</strong><small>{timeAgo(notice.ts, now || Date.now())}</small></span></button> }) : <p className="notice-empty">Chưa có thông báo nào.</p>}</div>
    <button type="button" className="full-text-button" onClick={() => { close(); navigate('Thông báo') }}>Xem tất cả thông báo</button>
  </div>}</Popover>
}

function SearchPalette({ onClose }: { onClose: () => void }) {
  const { farmPonds } = useFarm()
  const { navigate, openForm } = useAppUI()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const results = useMemo(() => {
    const all = [
      ...allPages.map((page) => ({ group: 'Trang', label: page.label, icon: page.icon, run: () => navigate(page.label) })),
      ...farmPonds.map((pond) => ({ group: 'Ao nuôi', label: `${pond.name} (${pond.id})`, icon: Waves, run: () => navigate(`pond:${pond.id}`) })),
      ...farmPonds.flatMap((pond) => ['PH', 'TEMP', 'DO'].map((code) => ({ group: 'Cảm biến', label: `SENSOR-${pond.id}-${code}`, icon: Radio, run: () => navigate('IoT & Cảm biến') }))),
      { group: 'Thao tác', label: 'Thêm ao nuôi', icon: Plus, run: () => openForm({ kind: 'pond' }) },
      { group: 'Thao tác', label: 'Ghi nhận cho ăn', icon: Utensils, run: () => openForm({ kind: 'feed' }) },
      { group: 'Thao tác', label: 'Ghi nhận sức khỏe', icon: HeartPulse, run: () => openForm({ kind: 'health' }) },
    ]
    const q = query.trim().toLowerCase()
    return (q ? all.filter((item) => `${item.label} ${item.group}`.toLowerCase().includes(q)) : all.filter((item) => item.group !== 'Cảm biến')).slice(0, 12)
  }, [query, farmPonds, navigate, openForm])
  const choose = (i: number) => { const item = results[i]; if (!item) return; onClose(); item.run() }
  return <Modal title="Tìm kiếm" onClose={onClose} size="md">
    <div className="search-field palette-input"><Search /><input value={query} onChange={(event) => { setQuery(event.target.value); setIndex(0) }} onKeyDown={(event) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)) }
      if (event.key === 'ArrowUp') { event.preventDefault(); setIndex((i) => Math.max(i - 1, 0)) }
      if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); choose(index) }
    }} placeholder="Tìm trang, ao, cảm biến hoặc thao tác…" /></div>
    <div className="palette-results">{results.length ? results.map((item, i) => { const Icon = item.icon; return <button type="button" key={`${item.group}-${item.label}`} className={`menu-item ${i === index ? 'highlight' : ''}`} onMouseEnter={() => setIndex(i)} onClick={() => choose(i)}><Icon /><span>{item.label}</span><small>{item.group}</small></button> }) : <p className="notice-empty">Không tìm thấy kết quả cho “{query}”.</p>}</div>
  </Modal>
}

export function Header({ onOpenMobile }: { onOpenMobile: () => void }) {
  const { active, navigate } = useAppUI()
  const { profile } = useFarm()
  const title = usePageTitle(active)
  const profileItems = useProfileItems()
  const [searching, setSearching] = useState(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearching(true) } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  return <header className="topbar">
    <div className="mobile-brand"><button className="icon-button" onClick={onOpenMobile} aria-label="Mở menu"><MenuIcon /></button><Logo /></div>
    <div className="breadcrumb"><button type="button" onClick={() => navigate('Tổng quan')}>Trang chủ</button><ChevronRight />{active.startsWith('pond:') && <><button type="button" onClick={() => navigate('Ao nuôi')}>Ao nuôi</button><ChevronRight /></>}<strong>{title}</strong></div>
    <div className="header-actions"><FarmMenu variant="header" /><button className="icon-button" onClick={() => setSearching(true)} aria-label="Tìm kiếm (Ctrl+K)" title="Tìm kiếm (Ctrl+K)"><Search /></button><NotificationBell /><Menu label="Tài khoản" triggerClassName="header-user" width={210} trigger={<><div className="avatar">{initials(profile.name)}</div><ChevronDown /></>} items={profileItems} /></div>
    {searching && <SearchPalette onClose={() => setSearching(false)} />}
  </header>
}

function LiveIndicator() {
  const { connected, latest, now } = useTelemetry()
  const { farmPonds } = useFarm()
  const online = farmPonds.filter((pond) => latest[pond.id] && now - latest[pond.id].ts <= OFFLINE_AFTER_MS).length
  const label = !connected ? 'Mất kết nối máy chủ' : online ? `Dữ liệu trực tiếp · ${online}/${farmPonds.length} thiết bị` : 'Đang chờ thiết bị'
  const color = !connected ? '#c75d4d' : online ? undefined : '#c07c1b'
  return <span className="live" style={color ? { color } : undefined}><span style={color ? { background: color } : undefined} /> {label}</span>
}

export function PageHeader() {
  const { active, notify, openForm, range, setRange } = useAppUI()
  const { profile, farm } = useFarm()
  const { reload, now } = useTelemetry()
  const title = usePageTitle(active)
  const [refreshing, setRefreshing] = useState(false)
  const showRange = active === 'Tổng quan' || active.startsWith('pond:')
  const dateLabel = now ? new Date(now).toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase() : ''
  const refresh = async () => {
    setRefreshing(true)
    try { await reload(); notify('Dữ liệu đã được cập nhật') } catch { notify('Không thể tải dữ liệu, vui lòng thử lại') } finally { setRefreshing(false) }
  }
  const pondId = active.startsWith('pond:') ? active.slice(5) : undefined
  return <div className="page-heading">
    <div><div className="eyebrow">{dateLabel} <LiveIndicator /></div><h1>{active === 'Tổng quan' ? `Xin chào, ${profile.name}` : title}</h1><p>{active === 'Tổng quan' ? `Tổng quan tình trạng nuôi hôm nay tại ${farm.name}.` : pondId ? 'Chi tiết môi trường, thức ăn và sức khỏe của ao.' : PAGE_DESCRIPTION[active] ?? 'Theo dõi và quản lý hoạt động nuôi trồng của bạn.'}</p></div>
    <div className="heading-actions">
      {showRange && <Menu label="Khoảng thời gian" triggerClassName="outline-button" align="right" width={180} trigger={<><Clock3 /> {RANGES[range].label} <ChevronDown /></>} items={(Object.keys(RANGES) as RangeKey[]).map((key) => ({ label: RANGES[key].label, checked: key === range, onSelect: () => setRange(key) }))} />}
      <button className="outline-button" onClick={refresh} disabled={refreshing}><RefreshCw className={refreshing ? 'spin' : ''} /> <span className="desktop-only">Làm mới</span></button>
      <Menu label="Thêm mới" triggerClassName="primary-button" align="right" width={210} trigger={<><Plus /> Thêm mới</>} items={[
        { label: 'Thêm ao nuôi', icon: Waves, onSelect: () => openForm({ kind: 'pond' }) },
        { label: 'Ghi nhận cho ăn', icon: Utensils, onSelect: () => openForm({ kind: 'feed', pondId }) },
        { label: 'Ghi nhận sức khỏe', icon: HeartPulse, onSelect: () => openForm({ kind: 'health', pondId }) },
      ]} />
    </div>
  </div>
}

export function MobileDrawer({ onClose }: { onClose: () => void }) {
  const { active, navigate } = useAppUI()
  const { settings, updateSettings, setLoggedIn, farms, farm, setFarm } = useFarm()
  const alertBadge = useAlertBadge()
  const unread = useUnreadCount()
  const go = (page: string) => { navigate(page); onClose() }
  return <div className="mobile-menu-overlay" onClick={onClose}><div className="mobile-drawer" onClick={(event) => event.stopPropagation()}>
    <div className="drawer-head"><Logo /><button className="icon-button" onClick={onClose} aria-label="Đóng menu"><X /></button></div>
    <div className="drawer-farms">{farms.map((item) => <button key={item.id} className={item.id === farm.id ? 'selected' : ''} onClick={() => setFarm(item.id)}><Leaf /> {item.name}</button>)}</div>
    <div className="mobile-nav">{allPages.map((item) => { const Icon = item.icon; const badge = item.label === 'Cảnh báo' ? alertBadge : item.label === 'Thông báo' && unread ? String(unread) : undefined; return <button key={item.label} className={`nav-item ${active === item.label ? 'active' : ''}`} onClick={() => go(item.label)}><Icon /><span>{item.label}</span>{badge && <b>{badge}</b>}</button> })}</div>
    <div className="drawer-footer"><button className="theme-toggle" onClick={() => updateSettings({ dark: !settings.dark })}><CloudSun /> {settings.dark ? 'Chế độ sáng' : 'Chế độ tối'}<span className={`toggle ${settings.dark ? 'on' : ''}`} /></button><button className="nav-item" onClick={() => { onClose(); setLoggedIn(false) }}><LogOut /><span>Đăng xuất</span></button></div>
  </div></div>
}

export function BottomNav({ onMore }: { onMore: () => void }) {
  const { active, navigate } = useAppUI()
  const alertBadge = useAlertBadge()
  const is = (page: string) => (active === page || (page === 'Ao nuôi' && active.startsWith('pond:')) ? 'active' : '')
  return <nav className="bottom-nav"><button className={is('Tổng quan')} onClick={() => navigate('Tổng quan')}><LayoutDashboard /><span>Tổng quan</span></button><button className={is('Ao nuôi')} onClick={() => navigate('Ao nuôi')}><Waves /><span>Ao nuôi</span></button><button className={is('Cảnh báo')} onClick={() => navigate('Cảnh báo')}><AlertTriangle /><span>Cảnh báo</span>{alertBadge && <b>{alertBadge}</b>}</button><button className={is('AI phân tích')} onClick={() => navigate('AI phân tích')}><BrainCircuit /><span>AI</span></button><button onClick={onMore}><MenuIcon /><span>Thêm</span></button></nav>
}

export function LoginScreen() {
  const { profile, setLoggedIn } = useFarm()
  return <div className="login-screen"><div className="card login-card"><Logo /><h1>Bạn đã đăng xuất</h1><p>Đăng nhập lại để tiếp tục theo dõi trang trại.</p><div className="login-user"><div className="avatar">{initials(profile.name)}</div><div><strong>{profile.name}</strong><span>{profile.role}</span></div></div><button className="primary-button" onClick={() => setLoggedIn(true)}><LogIn /> Đăng nhập với tài khoản này</button></div></div>
}
