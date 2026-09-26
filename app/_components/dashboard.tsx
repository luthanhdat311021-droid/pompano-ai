'use client'

import { useState } from 'react'
import { Check, CheckCheck, ChevronRight, Download, Eye, List, MoreHorizontal, Sparkles } from 'lucide-react'
import { useFarm } from '@/lib/farm-store'
import { OFFLINE_AFTER_MS, issueKey, timeAgo, type Issue, type Limits } from '@/lib/telemetry'
import { useTelemetry } from '@/lib/use-telemetry'
import { AlertItem, ChartLegend, PondCard, QualitySummary, WaterChart, readingsCsv, useFarmIssues, useRangeHistory } from './shared'
import { Menu, RANGES, StatCard, downloadCsv, formatNumber, useAppUI } from './ui'

export const adviceFor: Record<Issue['metric'], string> = {
  ph: 'Kiểm tra hệ thống cấp nước và theo dõi pH trong 30 phút tiếp theo.',
  temp: 'Tăng cấp nước mới hoặc che mát, theo dõi nhiệt độ trong 1 giờ tới.',
  oxygen: 'Bật thêm máy sục khí và giảm lượng thức ăn cho đến khi oxy ổn định.',
  offline: 'Kiểm tra nguồn điện và kết nối Wi-Fi của thiết bị ESP32.',
}

export function referenceFor(metric: Issue['metric'], limits: Limits) {
  if (metric === 'ph') return `${limits.ph.min} – ${limits.ph.max}`
  if (metric === 'temp') return `${limits.temp.min} – ${limits.temp.max}°C`
  if (metric === 'oxygen') return `≥ ${limits.oxygen.min} mg/L`
  return `≤ ${OFFLINE_AFTER_MS / 1000} giây`
}

export function useSurvivalRate(pondIds?: string[]) {
  const { farmPonds, healthLogs } = useFarm()
  const ponds = pondIds ? farmPonds.filter((pond) => pondIds.includes(pond.id)) : farmPonds
  const ids = new Set(ponds.map((pond) => pond.id))
  const fish = ponds.reduce((sum, pond) => sum + pond.fish, 0)
  const dead = healthLogs.filter((log) => ids.has(log.pondId)).reduce((sum, log) => sum + log.dead, 0)
  return fish + dead ? (fish / (fish + dead)) * 100 : 100
}

function WaterQuality() {
  const { farmPonds } = useFarm()
  const { range, navigate, notify } = useAppUI()
  const [selected, setSelected] = useState(farmPonds[0]?.id ?? '')
  const pondId = farmPonds.some((pond) => pond.id === selected) ? selected : farmPonds[0]?.id ?? ''
  const readings = useRangeHistory(pondId, RANGES[range].ms)
  return <section className="card water-card">
    <div className="section-header"><div><h2>Chất lượng nước</h2><p>Theo dõi các chỉ số môi trường theo thời gian thực · {RANGES[range].label}</p></div><div className="chart-controls"><div className="segmented">{farmPonds.map((pond) => <button className={pondId === pond.id ? 'selected' : ''} key={pond.id} onClick={() => setSelected(pond.id)}>{pond.id}</button>)}</div><Menu label="Tùy chọn biểu đồ" trigger={<MoreHorizontal />} width={210} items={[
      { label: 'Xem chi tiết ao', icon: Eye, onSelect: () => navigate(`pond:${pondId}`) },
      { label: 'Xuất dữ liệu CSV', icon: Download, onSelect: () => { if (!readings.length) return notify('Chưa có dữ liệu để xuất'); downloadCsv(`chat-luong-nuoc-${pondId}.csv`, readingsCsv(pondId, readings)); notify(`Đã xuất ${readings.length} bản ghi của ao ${pondId}`) } },
    ]} /></div></div>
    <ChartLegend />
    <div className="chart-wrap"><WaterChart readings={readings} /></div>
    <QualitySummary readings={readings} />
  </section>
}

function AICard() {
  const { open } = useFarmIssues()
  const { latest, now } = useTelemetry()
  const { farmPonds, settings, acknowledge } = useFarm()
  const { navigate, notify } = useAppUI()
  const top = open[0]
  const online = farmPonds.filter((pond) => latest[pond.id])
  const lastUpdate = Math.max(0, ...online.map((pond) => latest[pond.id].ts))
  const metricCount = online.length * 3
  const tone = top?.level === 'danger' ? '#c75d4d' : top?.level === 'info' ? '#397caf' : undefined
  return <section className="card ai-card">
    <div className="section-header"><div><div className="card-icon-title"><span className="ai-icon"><Sparkles /></span><div><h2>AI phân tích</h2><p>Phát hiện và gợi ý từ dữ liệu</p></div></div></div><span className="demo-badge">Mô phỏng</span></div>
    <div className="ai-alert" style={tone ? { borderLeftColor: tone } : !top ? { borderLeftColor: '#23a88a' } : undefined}>{top ? <>
      <div className="ai-alert-top"><span className="risk-label" style={tone ? { color: tone } : undefined}><span style={tone ? { background: tone } : undefined} /> {top.level === 'danger' ? 'NGUY HIỂM' : top.level === 'warning' ? 'CẢNH BÁO' : 'THÔNG TIN'}</span><span className="ai-time">{timeAgo(top.ts, now)}</span></div>
      <h3>{top.metric === 'offline' ? `Thiết bị tại Ao ${top.pondId} đang mất kết nối.` : `Điều kiện môi trường tại Ao ${top.pondId} đang có dấu hiệu bất thường.`}</h3>
      <div className="ai-facts"><div><span>Yếu tố</span><strong>{top.title} <em>{top.value}</em></strong></div><div><span>Tham chiếu</span><strong>{referenceFor(top.metric, settings.limits)}</strong></div></div>
      <p>{adviceFor[top.metric]}</p>
      <div className="ai-actions"><button className="text-button" onClick={() => navigate(`pond:${top.pondId}`)}>Xem chi tiết ao <ChevronRight /></button><button className="text-button" onClick={() => { acknowledge([issueKey(top)]); notify('Đã xác nhận cảnh báo') }}><Check /> Đã xử lý</button></div>
    </> : <>
      <div className="ai-alert-top"><span className="risk-label" style={{ color: '#23a88a' }}><span style={{ background: '#23a88a' }} /> ỔN ĐỊNH</span></div>
      <h3>{metricCount ? 'Tất cả các ao đang trong ngưỡng an toàn.' : 'Đang chờ dữ liệu từ thiết bị ESP32…'}</h3>
      <p>Hệ thống sẽ tự động cảnh báo khi phát hiện chỉ số bất thường.</p>
      <button className="text-button" onClick={() => navigate('AI phân tích')}>Xem phân tích chi tiết <ChevronRight /></button>
    </>}</div>
    <div className="ai-footer"><span><Check /> Đã phân tích {metricCount} chỉ số</span><span>{lastUpdate ? `Cập nhật ${timeAgo(lastUpdate, now)}` : 'Chưa có dữ liệu'}</span></div>
  </section>
}

export function Dashboard() {
  const { farmPonds, acknowledge } = useFarm()
  const { latest, now } = useTelemetry()
  const { open } = useFarmIssues()
  const { navigate, notify } = useAppUI()
  const survival = useSurvivalRate()
  const dangerCount = open.filter((issue) => issue.level === 'danger').length
  const online = farmPonds.filter((pond) => latest[pond.id] && now - latest[pond.id].ts <= OFFLINE_AFTER_MS).length
  const fish = farmPonds.reduce((sum, pond) => sum + pond.fish, 0)
  const area = farmPonds.reduce((sum, pond) => sum + pond.area, 0)
  return <>
    <div className="stats-grid">
      <StatCard label="Tổng số ao" value={`${farmPonds.length} ao`} detail={`${formatNumber(area)} m² mặt nước`} />
      <StatCard label="Ao đang hoạt động" value={`${online} ao`} detail="thiết bị đang gửi dữ liệu" />
      <StatCard label="Cá đang nuôi" value={`~${formatNumber(fish)}`} detail={`trong ${farmPonds.length} ao`} />
      <StatCard label="Cảnh báo cần xử lý" value={String(open.length)} detail={`${dangerCount} nguy hiểm, ${open.length - dangerCount} theo dõi`} />
      <StatCard label="Tỷ lệ sống" value={`${survival.toFixed(1)}%`} detail="theo nhật ký sức khỏe" />
    </div>
    <div className="dashboard-grid"><WaterQuality /><AICard /></div>
    <div className="lower-grid">
      <section className="card ponds-section"><div className="section-header"><div><h2>Ao nuôi</h2><p>Trạng thái các ao trong trang trại</p></div><button className="text-button" onClick={() => navigate('Ao nuôi')}>Xem tất cả <ChevronRight /></button></div><div className="pond-list">{farmPonds.slice(0, 3).map((pond) => <PondCard key={pond.id} pond={pond} />)}</div></section>
      <section className="card alerts-section"><div className="section-header"><div><h2>Cảnh báo hiện tại</h2><p>Tính từ dữ liệu cảm biến mới nhất</p></div><Menu label="Tùy chọn cảnh báo" trigger={<MoreHorizontal />} width={210} items={[
        { label: 'Xác nhận tất cả', icon: CheckCheck, onSelect: () => { if (!open.length) return notify('Không có cảnh báo cần xác nhận'); acknowledge(open.map(issueKey)); notify(`Đã xác nhận ${open.length} cảnh báo`) } },
        { label: 'Xem tất cả cảnh báo', icon: List, onSelect: () => navigate('Cảnh báo') },
      ]} /></div>
        <div className="alert-list">{open.length ? open.slice(0, 3).map((issue) => <AlertItem key={issueKey(issue)} issue={issue} />) : <div className="alert-item info"><div className="alert-symbol"><Check /></div><div><strong>Không có cảnh báo</strong><p>Tất cả chỉ số đang trong ngưỡng an toàn</p></div></div>}</div>
        <button className="full-text-button" onClick={() => navigate('Cảnh báo')}>Xem tất cả cảnh báo{open.length > 3 ? ` (${open.length})` : ''}</button></section>
    </div>
  </>
}
