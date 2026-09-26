'use client'

import { useMemo } from 'react'
import { ArrowDownRight, ArrowUpRight, ChevronRight, Droplets, Eye, Fish, Gauge, HeartPulse, MoreHorizontal, Pencil, Radio, Thermometer, Trash2, Utensils } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { startOfDay, useFarm, type Pond } from '@/lib/farm-store'
import { issueKey, pondIssues, pondStatus, timeAgo, type Issue, type Reading } from '@/lib/telemetry'
import { useTelemetry } from '@/lib/use-telemetry'
import { Menu, StatusBadge, formatNumber, formatTime, useAppUI } from './ui'

export const alertIcon = { ph: Droplets, temp: Thermometer, oxygen: Gauge, offline: Radio }
export const LEVEL_LABEL = { danger: 'Nguy hiểm', warning: 'Cảnh báo', info: 'Thông tin' }

export function sortIssues(issues: Issue[]) {
  const rank = { danger: 0, warning: 1, info: 2 }
  return [...issues].sort((a, b) => rank[a.level] - rank[b.level] || a.pondId.localeCompare(b.pondId))
}

// Issues for the ponds of the selected farm, split by whether an operator acknowledged them.
export function useFarmIssues() {
  const { issues } = useTelemetry()
  const { farmPonds, acks } = useFarm()
  return useMemo(() => {
    const ids = new Set(farmPonds.map((pond) => pond.id))
    const all = sortIssues(issues.filter((issue) => ids.has(issue.pondId)))
    return { all, open: all.filter((issue) => !acks[issueKey(issue)]), acknowledged: all.filter((issue) => acks[issueKey(issue)]) }
  }, [issues, farmPonds, acks])
}

export function usePondState(pondId: string) {
  const { latest, now } = useTelemetry()
  const { settings } = useFarm()
  const reading = latest[pondId]
  const issues = pondIssues(pondId, reading, now, settings.limits)
  return { reading, issues, status: pondStatus(reading, issues), online: !!reading && !issues.some((issue) => issue.metric === 'offline') }
}

export function todayFeedKg(pondId: string, logs: { pondId: string; kg: number; ts: number }[]) {
  const from = startOfDay(Date.now())
  return logs.filter((log) => log.pondId === pondId && log.ts >= from).reduce((sum, log) => sum + log.kg, 0)
}

export function usePondActions() {
  const { openForm, confirm, navigate, notify } = useAppUI()
  const { deletePond } = useFarm()
  return (pond: Pond) => [
    { label: 'Xem chi tiết', icon: Eye, onSelect: () => navigate(`pond:${pond.id}`) },
    { label: 'Chỉnh sửa', icon: Pencil, onSelect: () => openForm({ kind: 'pond', pond }) },
    { label: 'Ghi nhận cho ăn', icon: Utensils, onSelect: () => openForm({ kind: 'feed', pondId: pond.id }) },
    { label: 'Ghi nhận sức khỏe', icon: HeartPulse, onSelect: () => openForm({ kind: 'health', pondId: pond.id }) },
    'separator' as const,
    { label: 'Xóa ao', icon: Trash2, danger: true, onSelect: () => confirm({ title: `Xóa ${pond.name}?`, message: `Toàn bộ nhật ký cho ăn và sức khỏe của ${pond.name} sẽ bị xóa. Thao tác này không thể hoàn tác.`, confirmLabel: 'Xóa ao', danger: true, onConfirm: () => { deletePond(pond.id); notify(`Đã xóa ${pond.name}`); navigate('Ao nuôi') } }) },
  ]
}

export function PondCard({ pond }: { pond: Pond }) {
  const { reading, status } = usePondState(pond.id)
  const { feedLogs } = useFarm()
  const { navigate } = useAppUI()
  const actions = usePondActions()
  return <article className="pond-card">
    <div className="pond-card-head"><div><div className="pond-title"><span className="pond-code">{pond.id}</span><h3>{pond.name}</h3></div><StatusBadge tone={status.tone}>{status.label}</StatusBadge></div><Menu label={`Tùy chọn ${pond.name}`} trigger={<MoreHorizontal />} items={actions(pond)} /></div>
    <div className="pond-water"><div><span>pH</span><strong>{reading ? reading.ph.toFixed(2) : '—'}</strong></div><div><span>Nhiệt độ</span><strong>{reading ? `${reading.temp.toFixed(1)}°C` : '—'}</strong></div><div><span>Oxy hòa tan</span><strong>{reading ? `${reading.oxygen.toFixed(2)} mg/L` : '—'}</strong></div></div>
    <div className="pond-footer"><span title="Số cá hiện có"><Fish /> {formatNumber(pond.fish)} con</span><span title="Thức ăn hôm nay"><Utensils /> {formatNumber(todayFeedKg(pond.id, feedLogs), 1)} kg</span><button type="button" onClick={() => navigate(`pond:${pond.id}`)}>Chi tiết <ChevronRight /></button></div>
  </article>
}

export function Trend({ history, metric, unit, digits }: { history: Reading[]; metric: 'ph' | 'temp' | 'oxygen'; unit: string; digits: number }) {
  const last = history.at(-1)
  if (!last) return <strong>—</strong>
  const first = history[0][metric]
  const change = first ? ((last[metric] - first) / first) * 100 : 0
  const up = change >= 0
  return <strong>{last[metric].toFixed(digits)}{unit} <small className={up ? 'positive' : 'negative'}>{up ? <ArrowUpRight /> : <ArrowDownRight />} {Math.abs(change).toFixed(1)}%</small></strong>
}

export function useRangeHistory(pondId: string, rangeMs: number) {
  const { history, now } = useTelemetry()
  const pondHistory = history[pondId]
  return useMemo(() => (pondHistory ?? []).filter((reading) => reading.ts >= now - rangeMs), [pondHistory, now, rangeMs])
}

export function WaterChart({ readings, height = 245 }: { readings: Reading[]; height?: number }) {
  const data = readings.map((reading) => ({ time: formatTime(reading.ts), ph: reading.ph, temp: reading.temp, oxygen: reading.oxygen }))
  const tick = { fill: 'var(--muted-foreground)', fontSize: 11 }
  if (!data.length) return <div className="chart-empty" style={{ height }}>Chưa có dữ liệu trong khoảng thời gian này</div>
  return <ResponsiveContainer width="100%" height={height}><LineChart data={data} margin={{ top: 10, right: -10, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" /><XAxis dataKey="time" tickLine={false} axisLine={false} tick={tick} minTickGap={40} /><YAxis yAxisId="left" tickLine={false} axisLine={false} tick={tick} domain={[3, 10]} ticks={[3, 4, 5, 6, 7, 8, 9, 10]} /><YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tick={tick} domain={[22, 34]} /><Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12 }} /><Line yAxisId="left" type="monotone" dataKey="ph" name="pH" stroke="#159b9b" strokeWidth={2.5} dot={false} isAnimationActive={false} /><Line yAxisId="right" type="monotone" dataKey="temp" name="Nhiệt độ (°C)" stroke="#e69b3a" strokeWidth={2.5} dot={false} isAnimationActive={false} /><Line yAxisId="left" type="monotone" dataKey="oxygen" name="Oxy hòa tan (mg/L)" stroke="#4a88c7" strokeWidth={2.5} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer>
}

export function ChartLegend() {
  return <div className="legend-row"><span><i className="legend-dot ph" /> pH</span><span><i className="legend-dot temp" /> Nhiệt độ (trục phải)</span><span><i className="legend-dot oxygen" /> Oxy hòa tan</span></div>
}

export function QualitySummary({ readings }: { readings: Reading[] }) {
  return <div className="quality-summary"><div><span>pH</span><Trend history={readings} metric="ph" unit="" digits={2} /></div><div><span>Nhiệt độ</span><Trend history={readings} metric="temp" unit="°C" digits={1} /></div><div><span>Oxy hòa tan</span><Trend history={readings} metric="oxygen" unit=" mg/L" digits={2} /></div></div>
}

export function readingsCsv(pondId: string, readings: Reading[]) {
  return [['Thời gian', 'Ao', 'Thiết bị', 'pH', 'Nhiệt độ (°C)', 'Oxy hòa tan (mg/L)'], ...readings.map((reading) => [new Date(reading.ts).toLocaleString('vi-VN'), pondId, reading.deviceId, reading.ph, reading.temp, reading.oxygen])]
}

export function AlertItem({ issue, acknowledged }: { issue: Issue; acknowledged?: boolean }) {
  const { navigate } = useAppUI()
  const { now } = useTelemetry()
  const { ponds } = useFarm()
  const Icon = alertIcon[issue.metric]
  const name = ponds.find((pond) => pond.id === issue.pondId)?.name ?? `Ao ${issue.pondId}`
  return <button type="button" className={`alert-item ${issue.level}`} onClick={() => navigate(`pond:${issue.pondId}`)}><div className="alert-symbol"><Icon /></div><div><strong>{name} · {issue.title}{acknowledged && <em className="ack-tag">Đã xác nhận</em>}</strong><p>{issue.detail}</p><small>{formatTime(issue.ts)} · {timeAgo(issue.ts, now)}</small></div><ChevronRight /></button>
}
