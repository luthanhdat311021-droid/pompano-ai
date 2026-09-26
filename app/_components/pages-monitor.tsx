'use client'

import { useState } from 'react'
import { Bell, Check, CheckCheck, ChevronRight, Copy, Download, Eye, MoreHorizontal, Printer, RotateCcw, Search, Trash2 } from 'lucide-react'
import { startOfDay, useFarm, type ActivityKind } from '@/lib/farm-store'
import { OFFLINE_AFTER_MS, issueKey, timeAgo } from '@/lib/telemetry'
import { useTelemetry } from '@/lib/use-telemetry'
import { TableCard } from './pages-manage'
import { LEVEL_LABEL, alertIcon, useFarmIssues } from './shared'
import { EmptyState, Menu, StatCard, StatusBadge, downloadCsv, formatDateTime, formatNumber, useAppUI } from './ui'

const DAY = 86_400_000
const LEVEL_TONE = { danger: 'red', warning: 'amber', info: 'blue' }

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

export function IotPage() {
  const { farmPonds } = useFarm()
  const { latest, now, connected } = useTelemetry()
  const { all } = useFarmIssues()
  const { navigate, notify } = useAppUI()
  const [query, setQuery] = useState('')
  const [origin] = useState(() => (typeof window === 'undefined' ? '' : window.location.origin))
  const rows = farmPonds.flatMap((pond) => {
    const reading = latest[pond.id]
    const online = !!reading && now - reading.ts <= OFFLINE_AFTER_MS
    return ([['PH', 'pH', reading?.ph.toFixed(2)], ['TEMP', 'Nhiệt độ', reading && `${reading.temp.toFixed(1)}°C`], ['DO', 'Oxy hòa tan', reading && `${reading.oxygen.toFixed(2)} mg/L`]] as const).map(([code, kind, value]) => ({ id: `SENSOR-${pond.id}-${code}`, device: `ESP32-${pond.id}`, pond, kind, online, value: online ? value : '—', seen: reading ? timeAgo(reading.ts, now) : 'Chưa kết nối', state: online ? 'Online' : reading ? 'Offline' : 'Chờ kết nối' }))
  })
  const onlineCount = rows.filter((row) => row.online).length
  const q = query.trim().toLowerCase()
  const visible = rows.filter((row) => `${row.id} ${row.device} ${row.pond.name} ${row.kind} ${row.state}`.toLowerCase().includes(q))
  const endpoint = `${origin}/api/telemetry`
  const sample = `{"deviceId":"ESP32-${farmPonds[0]?.id ?? 'A01'}","pondId":"${farmPonds[0]?.id ?? 'A01'}","ph":7.8,"temp":28.4,"oxygen":6.1}`
  return <section className="generic-content">
    <div className="stats-grid compact-stats">
      <StatCard label="Tổng cảm biến" value={String(rows.length)} detail={`${farmPonds.length} mạch ESP32`} />
      <StatCard label="Đang online" value={String(onlineCount)} detail={`${rows.length ? ((onlineCount / rows.length) * 100).toFixed(1) : 0}% kết nối`} />
      <StatCard label="Offline / chờ" value={String(rows.length - onlineCount)} detail="Cần kiểm tra" />
      <StatCard label="Máy chủ dữ liệu" value={connected ? 'Kết nối' : 'Mất kết nối'} detail={`${all.length} cảnh báo đang hoạt động`} />
    </div>
    <TableCard title="Thiết bị & cảm biến" description="Dữ liệu được cập nhật theo thời gian thực" query={query} onQuery={setQuery} head={['Tên / Mã', 'Thiết bị', 'Khu vực', 'Trạng thái', 'Giá trị hiện tại', 'Cập nhật', '']} empty="Không có cảm biến phù hợp">
      {visible.map((row) => <tr key={row.id}><td><strong>{row.id}</strong></td><td>{row.device}</td><td>{row.pond.name}</td><td><StatusBadge tone={row.online ? 'green' : row.state === 'Offline' ? 'red' : 'blue'}>{row.state}</StatusBadge></td><td className="value-cell">{row.value}</td><td>{row.seen}</td><td><Menu label="Tùy chọn" trigger={<MoreHorizontal />} width={220} items={[
        { label: 'Xem ao', icon: Eye, onSelect: () => navigate(`pond:${row.pond.id}`) },
        { label: 'Sao chép mã thiết bị', icon: Copy, onSelect: async () => notify((await copyText(row.device)) ? `Đã sao chép ${row.device}` : 'Trình duyệt không cho phép sao chép') },
      ]} /></td></tr>)}
    </TableCard>
    <div className="card connect-card"><div className="section-header"><div><h2>Kết nối thiết bị ESP32</h2><p>Mỗi mạch gửi HTTP POST về địa chỉ bên dưới, <code>pondId</code> trùng với mã ao.</p></div></div>
      <div className="code-row"><span>Endpoint</span><code>{endpoint}</code><button className="outline-button" onClick={async () => notify((await copyText(endpoint)) ? 'Đã sao chép endpoint' : 'Trình duyệt không cho phép sao chép')}><Copy /> Sao chép</button></div>
      <div className="code-row"><span>Payload</span><code>{sample}</code><button className="outline-button" onClick={async () => notify((await copyText(sample)) ? 'Đã sao chép payload mẫu' : 'Trình duyệt không cho phép sao chép')}><Copy /> Sao chép</button></div>
      <p className="muted-note">Khi chạy thử không có phần cứng: <code>pnpm esp32:sim</code>. Firmware mẫu: <code>firmware/esp32_pompano</code>. Mạch ESP32 thật cần dùng địa chỉ IP LAN của máy chủ thay cho localhost.</p>
    </div>
  </section>
}

export function AlertsPage() {
  const { all, open, acknowledged } = useFarmIssues()
  const { acknowledge, unacknowledge, notices, farmPonds, acks } = useFarm()
  const { navigate, notify } = useAppUI()
  const [filter, setFilter] = useState<'all' | 'open' | 'ack'>('all')
  const ids = new Set(farmPonds.map((pond) => pond.id))
  const history = notices.filter((notice) => ids.has(notice.pondId))
  const rows = filter === 'open' ? open : filter === 'ack' ? acknowledged : all
  const dangerCount = open.filter((issue) => issue.level === 'danger').length
  return <section className="generic-content">
    <div className="stats-grid compact-stats">
      <StatCard label="Chưa xử lý" value={String(open.length)} detail="Cảnh báo đang mở" />
      <StatCard label="Nguy hiểm" value={String(dangerCount)} detail={dangerCount ? 'Cần xử lý ngay' : 'Không có'} />
      <StatCard label="Đã xác nhận" value={String(acknowledged.length)} detail="Tự đóng khi chỉ số ổn định" />
      <StatCard label="Ao bị ảnh hưởng" value={String(new Set(all.map((issue) => issue.pondId)).size)} detail={`Trên ${farmPonds.length} ao`} />
    </div>
    <div className="card data-card">
      <div className="section-header"><div><h2>Danh sách cảnh báo</h2><p>Tính từ dữ liệu cảm biến mới nhất</p></div><div className="table-tools"><div className="filter-pills">{([['all', 'Tất cả', all.length], ['open', 'Chưa xử lý', open.length], ['ack', 'Đã xác nhận', acknowledged.length]] as const).map(([key, label, count]) => <button key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)}>{label} <span>{count}</span></button>)}</div><button className="primary-button" onClick={() => { if (!open.length) return notify('Không có cảnh báo cần xác nhận'); acknowledge(open.map(issueKey)); notify(`Đã xác nhận ${open.length} cảnh báo`) }}><CheckCheck /> Xác nhận tất cả</button></div></div>
      <div className="table-wrap"><table><thead><tr><th>Cảnh báo</th><th>Khu vực</th><th>Mức độ</th><th>Giá trị</th><th>Trạng thái</th><th /></tr></thead><tbody>{rows.length ? rows.map((issue) => { const key = issueKey(issue); const isAck = !!acks[key]; return <tr key={key}><td><strong>{issue.title}</strong><div className="cell-sub">{issue.detail}</div></td><td>Ao {issue.pondId}</td><td><StatusBadge tone={LEVEL_TONE[issue.level]}>{LEVEL_LABEL[issue.level]}</StatusBadge></td><td className="value-cell">{issue.value}</td><td>{isAck ? <StatusBadge tone="green">Đã xác nhận</StatusBadge> : <StatusBadge tone="amber">Chưa xử lý</StatusBadge>}</td><td><div className="row-actions">{isAck ? <button className="text-button" onClick={() => unacknowledge(key)}><RotateCcw /> Mở lại</button> : <button className="text-button" onClick={() => { acknowledge([key]); notify('Đã xác nhận cảnh báo') }}><Check /> Xác nhận</button>}<button className="icon-button" aria-label="Xem ao" title="Xem ao" onClick={() => navigate(`pond:${issue.pondId}`)}><ChevronRight /></button></div></td></tr> }) : <tr><td colSpan={6} className="empty-cell">{filter === 'all' ? 'Tất cả chỉ số đang trong ngưỡng an toàn' : 'Không có cảnh báo trong mục này'}</td></tr>}</tbody></table></div>
    </div>
    <TableCard title="Lịch sử cảnh báo" description="Mỗi lần một chỉ số bắt đầu vượt ngưỡng" head={['Thời gian', 'Ao', 'Cảnh báo', 'Mức độ']} empty="Chưa ghi nhận cảnh báo nào">
      {history.slice(0, 30).map((notice) => <tr key={notice.id}><td>{formatDateTime(notice.ts)}</td><td><strong>Ao {notice.pondId}</strong></td><td>{notice.title}<div className="cell-sub">{notice.detail}</div></td><td><StatusBadge tone={LEVEL_TONE[notice.level]}>{LEVEL_LABEL[notice.level]}</StatusBadge></td></tr>)}
    </TableCard>
  </section>
}

export function NotificationsPage() {
  const { notices, markRead, ponds } = useFarm()
  const { navigate } = useAppUI()
  const { now } = useTelemetry()
  const [unreadOnly, setUnreadOnly] = useState(false)
  const unread = notices.filter((notice) => !notice.read).length
  const visible = unreadOnly ? notices.filter((notice) => !notice.read) : notices
  return <section className="generic-content"><div className="card">
    <div className="section-header"><div><h2>Thông báo</h2><p>{unread ? `${unread} thông báo chưa đọc` : 'Bạn đã đọc hết thông báo'}</p></div><div className="table-tools"><div className="filter-pills"><button className={!unreadOnly ? 'selected' : ''} onClick={() => setUnreadOnly(false)}>Tất cả <span>{notices.length}</span></button><button className={unreadOnly ? 'selected' : ''} onClick={() => setUnreadOnly(true)}>Chưa đọc <span>{unread}</span></button></div><button className="outline-button" disabled={!unread} onClick={() => markRead()}><CheckCheck /> Đánh dấu đã đọc</button></div></div>
    <div className="alert-list">{visible.length ? visible.map((notice) => { const Icon = alertIcon[notice.key.split('-')[1] as keyof typeof alertIcon] ?? Bell; return <button type="button" key={notice.id} className={`alert-item ${notice.level} ${notice.read ? 'is-read' : 'unread'}`} onClick={() => { markRead([notice.id]); navigate(`pond:${notice.pondId}`) }}><div className="alert-symbol"><Icon /></div><div><strong>{ponds.find((pond) => pond.id === notice.pondId)?.name ?? `Ao ${notice.pondId}`} · {notice.title}</strong><p>{notice.detail}</p><small>{formatDateTime(notice.ts)} · {timeAgo(notice.ts, now || Date.now())}</small></div>{!notice.read && <i className="unread-dot" />}<ChevronRight /></button> }) : <EmptyState icon={Bell} title="Không có thông báo" text={unreadOnly ? 'Không còn thông báo chưa đọc.' : 'Thông báo xuất hiện khi một chỉ số bắt đầu vượt ngưỡng.'} />}</div>
  </div></section>
}

const KIND_LABEL: Record<ActivityKind, string> = { pond: 'Ao nuôi', feed: 'Thức ăn', health: 'Sức khỏe', alert: 'Cảnh báo', system: 'Hệ thống' }
const KIND_TONE: Record<ActivityKind, string> = { pond: 'blue', feed: 'green', health: 'green', alert: 'amber', system: 'blue' }

export function ActivityPage() {
  const { activity, clearActivity } = useFarm()
  const { confirm, notify } = useAppUI()
  const [kind, setKind] = useState<ActivityKind | ''>('')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(50)
  const q = query.trim().toLowerCase()
  const visible = activity.filter((entry) => (!kind || entry.kind === kind) && entry.text.toLowerCase().includes(q))
  return <section className="generic-content">
    <div className="toolbar"><div className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm trong lịch sử..." /></div><div className="filter-pills"><button className={!kind ? 'selected' : ''} onClick={() => setKind('')}>Tất cả <span>{activity.length}</span></button>{(Object.keys(KIND_LABEL) as ActivityKind[]).map((key) => <button key={key} className={kind === key ? 'selected' : ''} onClick={() => setKind(key)}>{KIND_LABEL[key]} <span>{activity.filter((entry) => entry.kind === key).length}</span></button>)}</div></div>
    <TableCard title="Nhật ký hoạt động" description={`${visible.length} sự kiện`} head={['Thời gian', 'Loại', 'Nội dung']} empty="Không có sự kiện phù hợp" actions={<>
      <button className="outline-button" onClick={() => { downloadCsv('lich-su-hoat-dong.csv', [['Thời gian', 'Loại', 'Nội dung'], ...visible.map((entry) => [new Date(entry.ts).toLocaleString('vi-VN'), KIND_LABEL[entry.kind], entry.text])]); notify(`Đã xuất ${visible.length} sự kiện`) }}><Download /> Xuất CSV</button>
      <button className="outline-button danger-outline" onClick={() => confirm({ title: 'Xóa lịch sử hoạt động?', message: 'Toàn bộ nhật ký hoạt động sẽ bị xóa khỏi trình duyệt này. Dữ liệu ao, thức ăn và sức khỏe không bị ảnh hưởng.', confirmLabel: 'Xóa lịch sử', danger: true, onConfirm: () => { clearActivity(); notify('Đã xóa lịch sử hoạt động') } })}><Trash2 /> Xóa</button>
    </>}>{visible.slice(0, limit).map((entry) => <tr key={entry.id}><td>{formatDateTime(entry.ts)}</td><td><StatusBadge tone={KIND_TONE[entry.kind]}>{KIND_LABEL[entry.kind]}</StatusBadge></td><td className="text-cell">{entry.text}</td></tr>)}</TableCard>
    {visible.length > limit && <button className="outline-button load-more" onClick={() => setLimit(limit + 50)}>Xem thêm {Math.min(50, visible.length - limit)} sự kiện</button>}
  </section>
}

type Period = 'today' | '7d' | '30d'
const PERIODS: Record<Period, { label: string; days: number }> = { today: { label: 'Hôm nay', days: 1 }, '7d': { label: '7 ngày', days: 7 }, '30d': { label: '30 ngày', days: 30 } }

export function ReportsPage() {
  const { farm, farmPonds, feedLogs, healthLogs, notices, settings } = useFarm()
  const { history } = useTelemetry()
  const { notify } = useAppUI()
  const [period, setPeriod] = useState<Period>('7d')
  const from = startOfDay(Date.now()) - (PERIODS[period].days - 1) * DAY
  const stat = (values: number[], digits: number) => (values.length ? `${(values.reduce((a, b) => a + b, 0) / values.length).toFixed(digits)} (${Math.min(...values).toFixed(digits)}–${Math.max(...values).toFixed(digits)})` : '—')
  const rows = farmPonds.map((pond) => {
    const readings = history[pond.id] ?? []
    const feed = feedLogs.filter((log) => log.pondId === pond.id && log.ts >= from).reduce((sum, log) => sum + log.kg, 0)
    const dead = healthLogs.filter((log) => log.pondId === pond.id && log.ts >= from).reduce((sum, log) => sum + log.dead, 0)
    const alerts = notices.filter((notice) => notice.pondId === pond.id && notice.ts >= from).length
    return { pond, ph: stat(readings.map((r) => r.ph), 2), temp: stat(readings.map((r) => r.temp), 1), oxygen: stat(readings.map((r) => r.oxygen), 2), feed, dead, alerts, samples: readings.length }
  })
  const totals = rows.reduce((sum, row) => ({ feed: sum.feed + row.feed, dead: sum.dead + row.dead, alerts: sum.alerts + row.alerts }), { feed: 0, dead: 0, alerts: 0 })
  const exportCsv = () => {
    downloadCsv(`bao-cao-${farm.id}-${period}.csv`, [
      ['Báo cáo', farm.name, PERIODS[period].label, new Date().toLocaleString('vi-VN')],
      ['Ao', 'pH TB (min–max)', 'Nhiệt độ TB (°C)', 'Oxy TB (mg/L)', 'Số mẫu cảm biến', 'Thức ăn (kg)', 'Chi phí (đ)', 'Cá chết', 'Số cảnh báo', 'Số cá hiện có'],
      ...rows.map((row) => [row.pond.name, row.ph, row.temp, row.oxygen, row.samples, row.feed.toFixed(1), Math.round(row.feed * settings.feedPrice), row.dead, row.alerts, row.pond.fish]),
    ])
    notify('Đã xuất báo cáo CSV')
  }
  return <section className="generic-content report-page">
    <div className="toolbar"><div className="segmented">{(Object.keys(PERIODS) as Period[]).map((key) => <button key={key} className={period === key ? 'selected' : ''} onClick={() => setPeriod(key)}>{PERIODS[key].label}</button>)}</div><div className="table-tools no-print"><button className="outline-button" onClick={exportCsv}><Download /> Xuất CSV</button><button className="outline-button" onClick={() => window.print()}><Printer /> In báo cáo</button></div></div>
    <div className="stats-grid compact-stats">
      <StatCard label="Tổng thức ăn" value={`${formatNumber(totals.feed, 1)} kg`} detail={PERIODS[period].label} />
      <StatCard label="Chi phí thức ăn" value={`${formatNumber(totals.feed * settings.feedPrice)} đ`} detail={`${formatNumber(settings.feedPrice)} đ/kg`} />
      <StatCard label="Cá chết" value={formatNumber(totals.dead)} detail="Theo nhật ký sức khỏe" />
      <StatCard label="Số lần cảnh báo" value={String(totals.alerts)} detail="Ghi nhận trong kỳ" />
    </div>
    <TableCard title={`Báo cáo theo ao · ${farm.name}`} description="Chỉ số nước tính trên dữ liệu cảm biến trong 1 giờ gần nhất (đang lưu trong bộ nhớ máy chủ)." head={['Ao', 'pH TB (min–max)', 'Nhiệt độ TB', 'Oxy TB', 'Thức ăn', 'Cá chết', 'Cảnh báo']} empty="Trang trại chưa có ao">
      {rows.map((row) => <tr key={row.pond.id}><td><strong>{row.pond.name}</strong></td><td>{row.ph}</td><td>{row.temp}</td><td>{row.oxygen}</td><td className="value-cell">{formatNumber(row.feed, 1)} kg</td><td>{row.dead}</td><td>{row.alerts}</td></tr>)}
    </TableCard>
  </section>
}
