// Printable environmental log for one pond, to support a VietGAP record-keeping file.
//
// Every figure comes from the system's own data (sensor history, feed and health logs).
// It is an internal report, not a certificate: VietGAP certification is only issued
// by accredited certification bodies.

import type { FeedLog, HealthLog, Notice, Pond } from './farm-store'
import type { Limits, Reading } from './telemetry'

const DAY = 86_400_000

export type EnvironmentReport = {
  reportId: string
  generatedAt: number
  farmName: string
  pond: Pond
  limits: Limits
  sensor: {
    samples: number
    spanMinutes: number
    ph: { avg: number; min: number; max: number }
    temp: { avg: number; min: number; max: number }
    oxygen: { avg: number; min: number; max: number }
    compliancePercent: number
  } | null
  feed: { totalKg: number; last7DaysKg: number; entries: number }
  fcr: number | null
  latestHealth: HealthLog | null
  healthLogs: HealthLog[]
  alerts: Notice[]
}

function stats(values: number[]) {
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  return { avg, min: Math.min(...values), max: Math.max(...values) }
}

// FCR = feed used / biomass gained between the first and last weighings. Needs two weighings.
function estimateFcr(pond: Pond, health: HealthLog[], feed: FeedLog[]) {
  if (health.length < 2) return null
  const first = health[0]
  const last = health[health.length - 1]
  const gainKg = ((last.weight - first.weight) / 1000) * pond.fish
  const feedKg = feed.filter((log) => log.ts >= first.ts && log.ts <= last.ts).reduce((sum, log) => sum + log.kg, 0)
  return gainKg > 0 && feedKg > 0 ? feedKg / gainKg : null
}

export function buildEnvironmentReport(input: { farmName: string; pond: Pond; readings: Reading[]; limits: Limits; feedLogs: FeedLog[]; healthLogs: HealthLog[]; notices: Notice[] }): EnvironmentReport {
  const { pond, readings, limits } = input
  const generatedAt = Date.now()
  const stockedAt = new Date(pond.stockedAt).getTime() || 0
  const feed = input.feedLogs.filter((log) => log.pondId === pond.id && log.ts >= stockedAt).sort((a, b) => a.ts - b.ts)
  const health = input.healthLogs.filter((log) => log.pondId === pond.id).sort((a, b) => a.ts - b.ts)
  const compliant = readings.filter((r) => r.ph >= limits.ph.min && r.ph <= limits.ph.max && r.temp >= limits.temp.min && r.temp <= limits.temp.max && r.oxygen >= limits.oxygen.min).length
  const stamp = new Date(generatedAt)
  const pad = (n: number) => String(n).padStart(2, '0')

  return {
    reportId: `BC-${pond.id}-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}`,
    generatedAt,
    farmName: input.farmName,
    pond,
    limits,
    sensor: readings.length ? {
      samples: readings.length,
      spanMinutes: Math.round((readings[readings.length - 1].ts - readings[0].ts) / 60_000),
      ph: stats(readings.map((r) => r.ph)),
      temp: stats(readings.map((r) => r.temp)),
      oxygen: stats(readings.map((r) => r.oxygen)),
      compliancePercent: (compliant / readings.length) * 100,
    } : null,
    feed: {
      totalKg: feed.reduce((sum, log) => sum + log.kg, 0),
      last7DaysKg: feed.filter((log) => log.ts >= generatedAt - 7 * DAY).reduce((sum, log) => sum + log.kg, 0),
      entries: feed.length,
    },
    fcr: estimateFcr(pond, health, feed),
    latestHealth: health.at(-1) ?? null,
    healthLogs: health.slice(-10).reverse(),
    alerts: input.notices.filter((notice) => notice.pondId === pond.id).slice(0, 15),
  }
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
const num = (value: number, digits = 0) => value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const dateTime = (ts: number) => new Date(ts).toLocaleString('vi-VN', { hour12: false })
const CONDITION: Record<HealthLog['condition'], string> = { good: 'Khỏe mạnh', watch: 'Cần theo dõi', sick: 'Có dấu hiệu bệnh' }
const LEVEL: Record<Notice['level'], string> = { danger: 'Nguy hiểm', warning: 'Cảnh báo', info: 'Thông tin' }

export function renderEnvironmentReport(report: EnvironmentReport) {
  const { pond, sensor, limits } = report
  const e = escapeHtml
  const row = (label: string, value: string) => `<div class="row"><span>${label}</span><strong>${value}</strong></div>`
  const days = Math.max(0, Math.floor((report.generatedAt - new Date(pond.stockedAt).getTime()) / DAY))

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>Nhật ký môi trường ${e(pond.name)} - ${e(report.reportId)}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 28px; color: #17313a; background: #f5f7f8; }
  .sheet { max-width: 820px; margin: 0 auto; background: #fff; padding: 32px 36px; border: 1px solid #dfe8e9; border-radius: 10px; }
  header { border-bottom: 2px solid #127f83; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; }
  h1 { font-size: 20px; margin: 0 0 4px; color: #127f83; }
  header p { margin: 0; font-size: 12px; color: #71838a; }
  .meta { text-align: right; font-size: 12px; color: #71838a; line-height: 1.6; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 18px; }
  .box { border: 1px solid #dfe8e9; border-radius: 8px; padding: 14px 16px; }
  h2 { font-size: 13px; margin: 0 0 10px; text-transform: uppercase; letter-spacing: .04em; color: #127f83; }
  .row { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; padding: 4px 0; border-bottom: 1px dashed #eef3f4; }
  .row span { color: #71838a; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; background: #eef3f4; color: #71838a; padding: 7px 8px; font-weight: 600; }
  td { padding: 7px 8px; border-top: 1px solid #eef3f4; }
  section { margin-bottom: 18px; }
  .muted { color: #71838a; font-size: 12px; }
  .note { font-size: 11px; color: #71838a; border-top: 1px solid #dfe8e9; padding-top: 12px; margin-top: 22px; line-height: 1.6; }
  .actions { text-align: center; margin-bottom: 16px; }
  .actions button { background: #127f83; color: #fff; border: 0; padding: 9px 20px; font-size: 13px; font-weight: 700; border-radius: 6px; cursor: pointer; }
  @media print { body { background: #fff; padding: 0; } .sheet { border: 0; padding: 0; } .actions { display: none; } }
</style>
</head>
<body>
<div class="actions"><button onclick="window.print()">In / Lưu PDF</button></div>
<div class="sheet">
  <header>
    <div><h1>Nhật ký môi trường ao nuôi</h1><p>Tài liệu hỗ trợ hồ sơ ghi chép VietGAP · Tạo tự động bởi Pompano AI</p></div>
    <div class="meta">Mã báo cáo: <strong>${e(report.reportId)}</strong><br>Ngày lập: ${dateTime(report.generatedAt)}</div>
  </header>

  <div class="grid">
    <div class="box"><h2>Thông tin ao nuôi</h2>
      ${row('Trang trại', e(report.farmName))}
      ${row('Ao nuôi', `${e(pond.name)} (${e(pond.id)})`)}
      ${row('Ngày thả giống', new Date(pond.stockedAt).toLocaleDateString('vi-VN'))}
      ${row('Số ngày nuôi', `${days} ngày`)}
      ${row('Số cá hiện có', `${num(pond.fish)} con`)}
      ${row('Diện tích', `${num(pond.area)} m²`)}
      ${row('Trọng lượng TB', report.latestHealth ? `${num(report.latestHealth.weight)} g/con (${new Date(report.latestHealth.ts).toLocaleDateString('vi-VN')})` : 'Chưa cân mẫu')}
    </div>
    <div class="box"><h2>Chất lượng nước (cảm biến IoT)</h2>
      ${sensor ? `
      ${row('pH TB (min – max)', `${num(sensor.ph.avg, 2)} (${num(sensor.ph.min, 2)} – ${num(sensor.ph.max, 2)})`)}
      ${row('Nhiệt độ TB (min – max)', `${num(sensor.temp.avg, 1)} (${num(sensor.temp.min, 1)} – ${num(sensor.temp.max, 1)}) °C`)}
      ${row('Oxy hòa tan TB (min)', `${num(sensor.oxygen.avg, 2)} (${num(sensor.oxygen.min, 2)}) mg/L`)}
      ${row('Số mẫu', `${num(sensor.samples)} mẫu trong ${sensor.spanMinutes} phút`)}
      ${row('Tỷ lệ mẫu trong ngưỡng', `${num(sensor.compliancePercent, 1)}%`)}
      <p class="muted">Ngưỡng áp dụng: pH ${limits.ph.min}–${limits.ph.max}, nhiệt độ ${limits.temp.min}–${limits.temp.max} °C, oxy ≥ ${limits.oxygen.min} mg/L. Hệ thống hiện chỉ lưu khoảng 1 giờ dữ liệu cảm biến gần nhất.</p>` : '<p class="muted">Chưa có dữ liệu cảm biến cho ao này.</p>'}
    </div>
  </div>

  <div class="grid">
    <div class="box"><h2>Thức ăn</h2>
      ${row('Tổng từ ngày thả', `${num(report.feed.totalKg, 1)} kg (${report.feed.entries} lần ghi)`)}
      ${row('7 ngày gần nhất', `${num(report.feed.last7DaysKg, 1)} kg`)}
      ${row('FCR ước tính', report.fcr ? num(report.fcr, 2) : 'Chưa đủ dữ liệu (cần ≥ 2 lần cân mẫu)')}
    </div>
    <div class="box"><h2>Cảnh báo đã ghi nhận</h2>
      ${report.alerts.length ? `<table><tr><th>Thời gian</th><th>Nội dung</th><th>Mức</th></tr>${report.alerts.map((a) => `<tr><td>${dateTime(a.ts)}</td><td>${e(a.title)}</td><td>${LEVEL[a.level]}</td></tr>`).join('')}</table>` : '<p class="muted">Không có cảnh báo nào được ghi nhận.</p>'}
    </div>
  </div>

  <section><h2>Nhật ký sức khỏe (10 lần gần nhất)</h2>
    ${report.healthLogs.length ? `<table><tr><th>Ngày</th><th>Tình trạng</th><th>Cá chết</th><th>TB (g/con)</th><th>Ghi chú</th></tr>${report.healthLogs.map((h) => `<tr><td>${dateTime(h.ts)}</td><td>${CONDITION[h.condition]}</td><td>${num(h.dead)}</td><td>${num(h.weight)}</td><td>${e(h.note || '—')}</td></tr>`).join('')}</table>` : '<p class="muted">Chưa có bản ghi sức khỏe.</p>'}
  </section>

  <p class="note">Báo cáo được tổng hợp tự động từ dữ liệu cảm biến và nhật ký vận hành trong hệ thống Pompano AI, dùng làm tài liệu tham khảo khi lập hồ sơ VietGAP. Đây <strong>không phải</strong> giấy chứng nhận VietGAP — chứng nhận chỉ do tổ chức chứng nhận được công nhận cấp.<br>Người lập: ........................................ &nbsp;&nbsp; Ký tên: ........................................</p>
</div>
</body>
</html>`
}

// Opens the report in a new tab; if pop-ups are blocked, downloads it as an HTML file instead.
export function openEnvironmentReport(report: EnvironmentReport): 'opened' | 'downloaded' {
  const url = URL.createObjectURL(new Blob([renderEnvironmentReport(report)], { type: 'text/html;charset=utf-8' }))
  const opened = window.open(url, '_blank')
  if (!opened) {
    const link = Object.assign(document.createElement('a'), { href: url, download: `${report.reportId}.html` })
    document.body.appendChild(link)
    link.click()
    link.remove()
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return opened ? 'opened' : 'downloaded'
}
