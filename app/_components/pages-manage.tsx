'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, Download, Eye, Fish, HeartPulse, MoreHorizontal, Pencil, Plus, Radio, Search, Trash2, Utensils, Waves } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CONDITION_LABEL, startOfDay, useFarm, type HealthCondition } from '@/lib/farm-store'
import { issueKey, pondIssues, pondStatus, timeAgo } from '@/lib/telemetry'
import { useTelemetry } from '@/lib/use-telemetry'
import { useSurvivalRate } from './dashboard'
import { AlertItem, ChartLegend, PondCard, QualitySummary, WaterChart, readingsCsv, todayFeedKg, usePondActions, usePondState, useRangeHistory } from './shared'
import { EmptyState, Menu, RANGES, StatCard, StatusBadge, downloadCsv, formatDateTime, formatNumber, useAppUI } from './ui'

const DAY = 86_400_000
const CONDITION_TONE: Record<HealthCondition, string> = { good: 'green', watch: 'amber', sick: 'red' }

export function TableCard({ title, description, query, onQuery, actions, head, children, empty }: { title: string; description: string; query?: string; onQuery?: (value: string) => void; actions?: React.ReactNode; head: string[]; children: React.ReactNode[]; empty: string }) {
  return <div className="card data-card">
    <div className="section-header"><div><h2>{title}</h2><p>{description}</p></div><div className="table-tools">{onQuery && <div className="search-field small"><Search /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Tìm kiếm..." /></div>}{actions}</div></div>
    <div className="table-wrap"><table><thead><tr>{head.map((cell, index) => <th key={index}>{cell}</th>)}</tr></thead><tbody>{children.length ? children : <tr><td colSpan={head.length} className="empty-cell">{empty}</td></tr>}</tbody></table></div>
  </div>
}

function usePondStatuses() {
  const { farmPonds, settings } = useFarm()
  const { latest, now } = useTelemetry()
  return useMemo(() => Object.fromEntries(farmPonds.map((pond) => {
    const reading = latest[pond.id]
    return [pond.id, pondStatus(reading, pondIssues(pond.id, reading, now, settings.limits)).label]
  })), [farmPonds, latest, now, settings.limits])
}

export function PondsPage() {
  const { farmPonds } = useFarm()
  const { openForm } = useAppUI()
  const statuses = usePondStatuses()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('Tất cả')
  const filters = ['Tất cả', 'Bình thường', 'Cảnh báo', 'Nguy hiểm', 'Mất kết nối', 'Chờ dữ liệu']
  const count = (label: string) => (label === 'Tất cả' ? farmPonds.length : farmPonds.filter((pond) => statuses[pond.id] === label).length)
  const visible = farmPonds.filter((pond) => (filter === 'Tất cả' || statuses[pond.id] === filter) && `${pond.name} ${pond.id}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <section className="generic-content">
    <div className="toolbar"><div className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm kiếm ao..." /></div><div className="filter-pills">{filters.filter((label) => label === 'Tất cả' || label === filter || count(label) > 0).map((label) => <button key={label} className={filter === label ? 'selected' : ''} onClick={() => setFilter(label)}>{label} <span>{count(label)}</span></button>)}</div></div>
    <div className="ponds-page-grid">{visible.map((pond) => <PondCard key={pond.id} pond={pond} />)}<button className="add-pond-card" onClick={() => openForm({ kind: 'pond' })}><Plus /><strong>Thêm ao mới</strong><span>Tạo ao nuôi và bắt đầu theo dõi</span></button></div>
    {!visible.length && farmPonds.length > 0 && <p className="muted-note">Không có ao nào khớp với bộ lọc hiện tại.</p>}
  </section>
}

export function PondDetail({ pondId }: { pondId: string }) {
  const { ponds, feedLogs, healthLogs, settings } = useFarm()
  const { navigate, openForm, range, notify } = useAppUI()
  const { now } = useTelemetry()
  const pond = ponds.find((item) => item.id === pondId)
  const { reading, issues, status, online } = usePondState(pondId)
  const readings = useRangeHistory(pondId, RANGES[range].ms)
  const survival = useSurvivalRate([pondId])
  const actions = usePondActions()
  if (!pond) return <div className="card"><EmptyState icon={Waves} title={`Không tìm thấy ao ${pondId}`} text="Ao có thể đã bị xóa hoặc thuộc trang trại khác." action={<button className="primary-button" onClick={() => navigate('Ao nuôi')}><ArrowLeft /> Về danh sách ao</button>} /></div>
  const feeds = feedLogs.filter((log) => log.pondId === pondId).sort((a, b) => b.ts - a.ts)
  const health = healthLogs.filter((log) => log.pondId === pondId).sort((a, b) => b.ts - a.ts)
  const week = feeds.filter((log) => log.ts >= startOfDay(Date.now()) - 6 * DAY).reduce((sum, log) => sum + log.kg, 0)
  const days = Math.max(0, Math.floor((Date.now() - new Date(pond.stockedAt).getTime()) / DAY))
  return <section className="generic-content">
    <div className="detail-toolbar">
      <button className="outline-button" onClick={() => navigate('Ao nuôi')}><ArrowLeft /> Ao nuôi</button>
      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      <div className="detail-actions">
        <button className="outline-button" onClick={() => openForm({ kind: 'feed', pondId })}><Utensils /> <span className="desktop-only">Cho ăn</span></button>
        <button className="outline-button" onClick={() => openForm({ kind: 'health', pondId })}><HeartPulse /> <span className="desktop-only">Sức khỏe</span></button>
        <button className="outline-button" onClick={() => openForm({ kind: 'pond', pond })}><Pencil /> <span className="desktop-only">Chỉnh sửa</span></button>
        <Menu label="Tùy chọn khác" triggerClassName="outline-button icon-only" trigger={<MoreHorizontal />} width={210} items={[
          { label: 'Xuất dữ liệu cảm biến', icon: Download, onSelect: () => { if (!readings.length) return notify('Chưa có dữ liệu để xuất'); downloadCsv(`chat-luong-nuoc-${pondId}.csv`, readingsCsv(pondId, readings)); notify(`Đã xuất ${readings.length} bản ghi`) } },
          ...actions(pond).slice(-2),
        ]} />
      </div>
    </div>
    <div className="stats-grid compact-stats">
      <StatCard label="Số cá hiện có" value={formatNumber(pond.fish)} detail={`Mật độ ${(pond.fish / pond.area).toFixed(1)} con/m² · ${formatNumber(pond.area)} m²`} />
      <StatCard label="Ngày nuôi" value={`${days} ngày`} detail={`Thả giống ${new Date(pond.stockedAt).toLocaleDateString('vi-VN')}`} />
      <StatCard label="Thức ăn hôm nay" value={`${formatNumber(todayFeedKg(pondId, feedLogs), 1)} kg`} detail={`${formatNumber(week, 1)} kg trong 7 ngày`} />
      <StatCard label="Tỷ lệ sống" value={`${survival.toFixed(1)}%`} detail={health[0] ? `TB ${health[0].weight} g/con · ${CONDITION_LABEL[health[0].condition].toLowerCase()}` : 'Chưa có kiểm tra sức khỏe'} />
    </div>
    <div className="dashboard-grid">
      <section className="card water-card"><div className="section-header"><div><h2>Chất lượng nước</h2><p>{RANGES[range].label} · đổi khoảng thời gian ở góc trên</p></div></div><ChartLegend /><div className="chart-wrap"><WaterChart readings={readings} /></div><QualitySummary readings={readings} /></section>
      <section className="card"><div className="section-header"><div><h2>Thiết bị & cảnh báo</h2><p>Trạng thái cảm biến của ao</p></div></div>
        <div className="device-box"><span className="ai-icon"><Radio /></span><div><strong>ESP32-{pondId}</strong><small>{reading ? `${online ? 'Online' : 'Offline'} · cập nhật ${timeAgo(reading.ts, now)}` : 'Chưa nhận dữ liệu — cấu hình pondId = ' + pondId}</small></div><StatusBadge tone={online ? 'green' : reading ? 'red' : 'blue'}>{online ? 'Online' : reading ? 'Offline' : 'Chờ kết nối'}</StatusBadge></div>
        <div className="alert-list">{issues.length ? issues.map((issue) => <AlertItem key={issueKey(issue)} issue={issue} />) : <p className="muted-note">Không có cảnh báo. Ngưỡng an toàn: pH {settings.limits.ph.min}–{settings.limits.ph.max}, nhiệt độ {settings.limits.temp.min}–{settings.limits.temp.max}°C, oxy ≥ {settings.limits.oxygen.min} mg/L.</p>}</div>
      </section>
    </div>
    <div className="lower-grid even">
      <TableCard title="Nhật ký cho ăn" description={`${feeds.length} bản ghi`} head={['Thời gian', 'Loại', 'Lượng']} empty="Chưa có bản ghi cho ăn" actions={<button className="outline-button" onClick={() => openForm({ kind: 'feed', pondId })}><Plus /> Thêm</button>}>{feeds.slice(0, 6).map((log) => <tr key={log.id}><td>{formatDateTime(log.ts)}</td><td>{log.type}</td><td className="value-cell">{log.kg} kg</td></tr>)}</TableCard>
      <TableCard title="Nhật ký sức khỏe" description={`${health.length} lần kiểm tra`} head={['Thời gian', 'Tình trạng', 'Cá chết', 'TB']} empty="Chưa có kiểm tra sức khỏe" actions={<button className="outline-button" onClick={() => openForm({ kind: 'health', pondId })}><Plus /> Thêm</button>}>{health.slice(0, 6).map((log) => <tr key={log.id}><td>{formatDateTime(log.ts)}</td><td><StatusBadge tone={CONDITION_TONE[log.condition]}>{CONDITION_LABEL[log.condition]}</StatusBadge></td><td>{log.dead}</td><td className="value-cell">{log.weight} g</td></tr>)}</TableCard>
    </div>
  </section>
}

function PondFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { farmPonds } = useFarm()
  return <select className="select-field" value={value} onChange={(event) => onChange(event.target.value)} aria-label="Lọc theo ao"><option value="">Tất cả ao</option>{farmPonds.map((pond) => <option key={pond.id} value={pond.id}>{pond.name}</option>)}</select>
}

export function HealthPage() {
  const { farmPonds, healthLogs, deleteHealth } = useFarm()
  const { openForm, navigate, confirm, notify } = useAppUI()
  const [query, setQuery] = useState('')
  const [pondId, setPondId] = useState('')
  const survival = useSurvivalRate()
  const ids = new Set(farmPonds.map((pond) => pond.id))
  const logs = healthLogs.filter((log) => ids.has(log.pondId)).sort((a, b) => b.ts - a.ts)
  const latestByPond = farmPonds.map((pond) => logs.find((log) => log.pondId === pond.id)).filter((log) => !!log)
  const weekDead = logs.filter((log) => log.ts >= Date.now() - 7 * DAY).reduce((sum, log) => sum + log.dead, 0)
  const avgWeight = latestByPond.length ? latestByPond.reduce((sum, log) => sum + log.weight, 0) / latestByPond.length : 0
  const watch = latestByPond.filter((log) => log.condition !== 'good')
  const q = query.trim().toLowerCase()
  const visible = logs.filter((log) => (!pondId || log.pondId === pondId) && `${log.pondId} ${log.note} ${CONDITION_LABEL[log.condition]}`.toLowerCase().includes(q))
  return <section className="generic-content">
    <div className="stats-grid compact-stats">
      <StatCard label="Tỷ lệ sống" value={`${survival.toFixed(1)}%`} detail="Toàn trang trại" />
      <StatCard label="Cá chết 7 ngày" value={formatNumber(weekDead)} detail="Tổng từ nhật ký" />
      <StatCard label="Trọng lượng TB" value={`${Math.round(avgWeight)} g`} detail="Lần kiểm tra gần nhất mỗi ao" />
      <StatCard label="Ao cần theo dõi" value={String(watch.length)} detail={watch.length ? watch.map((log) => log.pondId).join(', ') : 'Tất cả ao khỏe mạnh'} />
    </div>
    <TableCard title="Nhật ký sức khỏe" description={`${visible.length} lần kiểm tra`} query={query} onQuery={setQuery} head={['Thời gian', 'Ao', 'Tình trạng', 'Cá chết', 'Trọng lượng TB', 'Ghi chú', '']} empty="Không có bản ghi phù hợp" actions={<><PondFilter value={pondId} onChange={setPondId} /><button className="primary-button" onClick={() => openForm({ kind: 'health', pondId: pondId || undefined })}><Plus /> Ghi nhận</button></>}>
      {visible.slice(0, 100).map((log) => <tr key={log.id}><td>{formatDateTime(log.ts)}</td><td><strong>Ao {log.pondId}</strong></td><td><StatusBadge tone={CONDITION_TONE[log.condition]}>{CONDITION_LABEL[log.condition]}</StatusBadge></td><td>{log.dead}</td><td className="value-cell">{log.weight} g</td><td className="note-cell">{log.note || '—'}</td><td><Menu label="Tùy chọn" trigger={<MoreHorizontal />} items={[
        { label: 'Xem ao', icon: Eye, onSelect: () => navigate(`pond:${log.pondId}`) },
        { label: 'Xóa bản ghi', icon: Trash2, danger: true, onSelect: () => confirm({ title: 'Xóa bản ghi sức khỏe?', message: `Số cá chết (${log.dead}) sẽ được cộng trả lại vào Ao ${log.pondId}.`, confirmLabel: 'Xóa', danger: true, onConfirm: () => { deleteHealth(log.id); notify('Đã xóa bản ghi') } }) },
      ]} /></td></tr>)}
    </TableCard>
  </section>
}

export function FeedPage() {
  const { farmPonds, feedLogs, settings, deleteFeed } = useFarm()
  const { openForm, navigate, confirm, notify } = useAppUI()
  const [query, setQuery] = useState('')
  const [pondId, setPondId] = useState('')
  const ids = new Set(farmPonds.map((pond) => pond.id))
  const logs = feedLogs.filter((log) => ids.has(log.pondId)).sort((a, b) => b.ts - a.ts)
  const today = startOfDay(Date.now())
  const sumBetween = (from: number, to: number) => logs.filter((log) => log.ts >= from && log.ts < to).reduce((sum, log) => sum + log.kg, 0)
  const todayKg = sumBetween(today, today + DAY)
  const yesterdayKg = sumBetween(today - DAY, today)
  const weekKg = sumBetween(today - 6 * DAY, today + DAY)
  const monthStart = new Date(new Date(today).getFullYear(), new Date(today).getMonth(), 1).getTime()
  const monthKg = sumBetween(monthStart, today + DAY)
  const change = yesterdayKg ? ((todayKg - yesterdayKg) / yesterdayKg) * 100 : 0
  const chart = Array.from({ length: 7 }, (_, i) => { const from = today - (6 - i) * DAY; return { day: new Date(from).toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric' }), kg: Math.round(sumBetween(from, from + DAY) * 10) / 10 } })
  const q = query.trim().toLowerCase()
  const visible = logs.filter((log) => (!pondId || log.pondId === pondId) && `${log.pondId} ${log.type} ${log.note}`.toLowerCase().includes(q))
  return <section className="generic-content">
    <div className="stats-grid compact-stats">
      <StatCard label="Hôm nay" value={`${formatNumber(todayKg, 1)} kg`} trend={yesterdayKg ? `${change >= 0 ? '+' : ''}${change.toFixed(1)}%` : undefined} negative={change < 0} detail="so với hôm qua" />
      <StatCard label="7 ngày" value={`${formatNumber(weekKg, 1)} kg`} detail={`Trung bình ${formatNumber(weekKg / 7, 1)} kg/ngày`} />
      <StatCard label="Chi phí tháng này" value={`${formatNumber((monthKg * settings.feedPrice) / 1_000_000, 1)} tr`} detail={`${formatNumber(settings.feedPrice)} đ/kg · đổi trong Cài đặt`} />
      <StatCard label="Lần cho ăn hôm nay" value={String(logs.filter((log) => log.ts >= today).length)} detail={`${farmPonds.length} ao trong trang trại`} />
    </div>
    <div className="card"><div className="section-header"><div><h2>Lượng thức ăn 7 ngày</h2><p>Tổng kg mỗi ngày của trang trại</p></div></div><div className="chart-wrap small-chart"><ResponsiveContainer width="100%" height={180}><BarChart data={chart} margin={{ top: 14, right: 0, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" /><XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} /><Tooltip cursor={{ fill: 'var(--muted)' }} formatter={(value) => [`${value} kg`, 'Thức ăn']} contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12 }} /><Bar dataKey="kg" fill="#159b9b" radius={[4, 4, 0, 0]} maxBarSize={38} /></BarChart></ResponsiveContainer></div></div>
    <TableCard title="Nhật ký cho ăn" description={`${visible.length} bản ghi`} query={query} onQuery={setQuery} head={['Thời gian', 'Ao', 'Loại thức ăn', 'Lượng', 'Chi phí', 'Ghi chú', '']} empty="Không có bản ghi phù hợp" actions={<><PondFilter value={pondId} onChange={setPondId} /><button className="primary-button" onClick={() => openForm({ kind: 'feed', pondId: pondId || undefined })}><Plus /> Ghi nhận</button></>}>
      {visible.slice(0, 100).map((log) => <tr key={log.id}><td>{formatDateTime(log.ts)}</td><td><strong>Ao {log.pondId}</strong></td><td>{log.type}</td><td className="value-cell">{log.kg} kg</td><td>{formatNumber(log.kg * settings.feedPrice)} đ</td><td className="note-cell">{log.note || '—'}</td><td><Menu label="Tùy chọn" trigger={<MoreHorizontal />} items={[
        { label: 'Xem ao', icon: Eye, onSelect: () => navigate(`pond:${log.pondId}`) },
        { label: 'Xóa bản ghi', icon: Trash2, danger: true, onSelect: () => confirm({ title: 'Xóa bản ghi cho ăn?', message: `Bản ghi ${log.kg} kg tại Ao ${log.pondId} lúc ${formatDateTime(log.ts)} sẽ bị xóa.`, confirmLabel: 'Xóa', danger: true, onConfirm: () => { deleteFeed(log.id); notify('Đã xóa bản ghi') } }) },
      ]} /></td></tr>)}
    </TableCard>
    {!farmPonds.length && <EmptyState icon={Fish} title="Chưa có ao nuôi" text="Thêm ao trước khi ghi nhận cho ăn." />}
  </section>
}
