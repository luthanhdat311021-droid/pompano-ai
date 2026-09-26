'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowUpRight, Check, RotateCcw, Sparkles, TrendingDown, TrendingUp, Utensils } from 'lucide-react'
import { CONDITION_LABEL, initials, startOfDay, useFarm } from '@/lib/farm-store'
import { pondIssues, pondStatus, type Reading } from '@/lib/telemetry'
import { useTelemetry } from '@/lib/use-telemetry'
import { adviceFor, useSurvivalRate } from './dashboard'
import { useFarmIssues } from './shared'
import { formatNumber } from './ui'

const DAY = 86_400_000
type Message = { role: 'user' | 'ai'; text: string }

function average(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN
}

function windowAvg(readings: Reading[], metric: 'ph' | 'temp' | 'oxygen', from: number, to: number) {
  return average(readings.filter((r) => r.ts >= from && r.ts < to).map((r) => r[metric]))
}

// Rule-based analysis over live telemetry and farm logs (no external AI service).
function useAnalyst() {
  const farm = useFarm()
  const { latest, history, now } = useTelemetry()
  const { open, all } = useFarmIssues()
  const survival = useSurvivalRate()
  const today = startOfDay(now || Date.now())
  const ids = new Set(farm.farmPonds.map((pond) => pond.id))
  const feedBetween = (from: number, to: number, pondId?: string) => farm.feedLogs.filter((log) => (pondId ? log.pondId === pondId : ids.has(log.pondId)) && log.ts >= from && log.ts < to).reduce((sum, log) => sum + log.kg, 0)
  const tempTrend = (() => {
    const recent = average(farm.farmPonds.map((pond) => windowAvg(history[pond.id] ?? [], 'temp', now - 5 * 60_000, now)).filter(Number.isFinite))
    const before = average(farm.farmPonds.map((pond) => windowAvg(history[pond.id] ?? [], 'temp', now - 10 * 60_000, now - 5 * 60_000)).filter(Number.isFinite))
    return Number.isFinite(recent) && Number.isFinite(before) ? recent - before : NaN
  })()
  const feedToday = feedBetween(today, today + DAY)
  const feedAvg = feedBetween(today - 6 * DAY, today) / 6

  const describePond = (pondId: string) => {
    const pond = farm.ponds.find((item) => item.id === pondId)
    if (!pond) return `Không tìm thấy ao ${pondId} trong hệ thống.`
    const reading = latest[pondId]
    const issues = pondIssues(pondId, reading, now, farm.settings.limits)
    const status = pondStatus(reading, issues)
    const lines = [`${pond.name} — trạng thái: ${status.label}.`]
    if (reading) {
      lines.push(`Chỉ số hiện tại: pH ${reading.ph.toFixed(2)}, nhiệt độ ${reading.temp.toFixed(1)}°C, oxy hòa tan ${reading.oxygen.toFixed(2)} mg/L.`)
      const readings = history[pondId] ?? []
      const delta = windowAvg(readings, 'temp', now - 5 * 60_000, now) - windowAvg(readings, 'temp', now - 15 * 60_000, now - 5 * 60_000)
      if (Number.isFinite(delta) && Math.abs(delta) >= 0.2) lines.push(`Nhiệt độ ${delta > 0 ? 'tăng' : 'giảm'} ${Math.abs(delta).toFixed(1)}°C so với 10 phút trước.`)
    } else lines.push(`Chưa nhận dữ liệu từ ESP32-${pondId}.`)
    for (const issue of issues) lines.push(`⚠ ${issue.title}: ${issue.detail}. Gợi ý: ${adviceFor[issue.metric]}`)
    if (reading && !issues.length) lines.push('Các chỉ số đều trong ngưỡng an toàn, tiếp tục theo dõi bình thường.')
    const health = farm.healthLogs.filter((log) => log.pondId === pondId).sort((a, b) => b.ts - a.ts)[0]
    lines.push(`Số cá: ${formatNumber(pond.fish)} con. Thức ăn hôm nay: ${formatNumber(feedBetween(today, today + DAY, pondId), 1)} kg.${health ? ` Lần kiểm tra gần nhất: ${CONDITION_LABEL[health.condition].toLowerCase()}, TB ${health.weight} g/con.` : ''}`)
    return lines.join('\n')
  }

  const summary = () => {
    const online = farm.farmPonds.filter((pond) => latest[pond.id]).length
    const lines = [`Tóm tắt ${farm.farm.name}: ${farm.farmPonds.length} ao, ${online} ao có dữ liệu cảm biến, ~${formatNumber(farm.farmPonds.reduce((s, p) => s + p.fish, 0))} con cá, tỷ lệ sống ${survival.toFixed(1)}%.`]
    lines.push(open.length ? `Có ${open.length} cảnh báo chưa xử lý: ${open.map((issue) => `${issue.title} tại Ao ${issue.pondId}`).join('; ')}.` : 'Không có cảnh báo chưa xử lý.')
    if (Number.isFinite(tempTrend)) lines.push(`Nhiệt độ trung bình ${tempTrend >= 0 ? 'tăng' : 'giảm'} ${Math.abs(tempTrend).toFixed(2)}°C trong 5 phút gần nhất.`)
    lines.push(`Thức ăn hôm nay: ${formatNumber(feedToday, 1)} kg (trung bình 6 ngày trước: ${formatNumber(feedAvg, 1)} kg/ngày).`)
    return lines.join('\n')
  }

  const answer = (question: string) => {
    const q = question.toLowerCase()
    const pondId = question.toUpperCase().match(/\b([A-Z]\d{2})\b/)?.[1]
    if (pondId) return describePond(pondId)
    if (/(vấn đề|cảnh báo|bất thường|nguy hiểm|sự cố)/.test(q)) return all.length ? all.map((issue) => `• Ao ${issue.pondId} — ${issue.title}: ${issue.detail}. ${adviceFor[issue.metric]}`).join('\n') : 'Hiện không có ao nào gặp vấn đề. Tất cả chỉ số đang trong ngưỡng an toàn.'
    if (/(thức ăn|cho ăn|fcr|chi phí)/.test(q)) {
      const top = farm.farmPonds.map((pond) => ({ pond, kg: feedBetween(today, today + DAY, pond.id) })).sort((a, b) => b.kg - a.kg)[0]
      return `Hôm nay đã cho ăn ${formatNumber(feedToday, 1)} kg, chi phí khoảng ${formatNumber(feedToday * farm.settings.feedPrice)} đ.\nTrung bình 6 ngày trước: ${formatNumber(feedAvg, 1)} kg/ngày.${top ? `\nAo dùng nhiều nhất: ${top.pond.name} (${formatNumber(top.kg, 1)} kg).` : ''}${open.some((issue) => issue.metric === 'oxygen') ? '\nLưu ý: có ao đang thiếu oxy, nên giảm lượng thức ăn ở ao đó.' : ''}`
    }
    if (/(sức khỏe|chết|tỷ lệ sống|bệnh)/.test(q)) {
      const watch = farm.farmPonds.map((pond) => farm.healthLogs.filter((log) => log.pondId === pond.id).sort((a, b) => b.ts - a.ts)[0]).filter((log) => log && log.condition !== 'good')
      return `Tỷ lệ sống ước tính: ${survival.toFixed(1)}%.\n${watch.length ? `Ao cần theo dõi: ${watch.map((log) => `Ao ${log!.pondId} (${CONDITION_LABEL[log!.condition].toLowerCase()}${log!.note ? `: ${log!.note}` : ''})`).join('; ')}.` : 'Lần kiểm tra gần nhất của tất cả các ao đều khỏe mạnh.'}`
    }
    return summary()
  }

  return { answer, summary, open, all, tempTrend, feedToday, feedAvg, survival, online: farm.farmPonds.filter((pond) => latest[pond.id]).length }
}

export function AIPage() {
  const { farmPonds, profile } = useFarm()
  const analyst = useAnalyst()
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [thinking, setThinking] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const answerRef = useRef(analyst.answer)
  answerRef.current = analyst.answer

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [messages, thinking])

  const ask = (text: string) => {
    const value = text.trim()
    if (!value || thinking) return
    setMessages((prev) => [...prev, { role: 'user', text: value }])
    setQuestion('')
    setThinking(true)
    window.setTimeout(() => {
      setMessages((prev) => [...prev, { role: 'ai', text: answerRef.current(value) }])
      setThinking(false)
    }, 450)
  }

  const danger = analyst.open.some((issue) => issue.level === 'danger')
  const risk = danger ? { label: 'CAO', color: '#c45b4c', note: 'Có chỉ số ở mức nguy hiểm' } : analyst.open.length ? { label: 'TRUNG BÌNH', color: '#b97919', note: `${analyst.open.length} cảnh báo chưa xử lý` } : { label: 'THẤP', color: '#168e78', note: 'Không có cảnh báo mở' }
  const totalMetrics = analyst.online * 3
  const badMetrics = new Set(analyst.all.filter((issue) => issue.metric !== 'offline').map((issue) => `${issue.pondId}-${issue.metric}`)).size
  const insights = [
    analyst.open[0] ? { icon: AlertTriangle, warn: true, text: `Ao ${analyst.open[0].pondId}: ${analyst.open[0].title.toLowerCase()} (${analyst.open[0].value}).` } : { icon: Check, text: `Môi trường ${farmPonds.length} ao đang ổn định.` },
    Number.isFinite(analyst.tempTrend) ? { icon: analyst.tempTrend >= 0 ? TrendingUp : TrendingDown, text: `Nhiệt độ TB ${analyst.tempTrend >= 0 ? 'tăng' : 'giảm'} ${Math.abs(analyst.tempTrend).toFixed(2)}°C trong 5 phút gần đây.` } : { icon: TrendingUp, text: 'Chưa đủ dữ liệu để tính xu hướng nhiệt độ.' },
    { icon: Utensils, warn: analyst.feedAvg > 0 && analyst.feedToday > analyst.feedAvg * 1.1, text: `Thức ăn hôm nay ${formatNumber(analyst.feedToday, 1)} kg, TB 6 ngày trước ${formatNumber(analyst.feedAvg, 1)} kg/ngày.` },
  ]
  const prompts = [`Phân tích Ao ${farmPonds[0]?.id ?? 'A01'}`, 'Có ao nào đang gặp vấn đề?', 'Tóm tắt tình hình hôm nay', 'Tình hình thức ăn thế nào?']

  return <section className="ai-page">
    <div className="ai-overview">
      <div className="card overview-main"><div className="overview-title"><div className="ai-icon large"><Sparkles /></div><div><span className="eyebrow">POMPANO AI · PHÂN TÍCH TỰ ĐỘNG</span><h2>Trợ lý vận hành trang trại</h2><p>Phân tích dữ liệu môi trường, sức khỏe và quá trình nuôi để hỗ trợ bạn đưa ra quyết định.</p></div></div>
        <div className="risk-grid"><div><span>MỨC RỦI RO</span><strong style={{ color: risk.color }}>{risk.label}</strong><small>{risk.note}</small></div><div><span>MÔI TRƯỜNG</span><strong>{totalMetrics ? (badMetrics ? 'Có bất thường' : 'Bình thường') : 'Chờ dữ liệu'}</strong><small>{totalMetrics - badMetrics}/{totalMetrics} chỉ số an toàn</small></div><div><span>TỶ LỆ SỐNG</span><strong>{analyst.survival.toFixed(1)}%</strong><small>Theo nhật ký sức khỏe</small></div></div>
      </div>
      <div className="card insight-list"><div className="section-header"><div><h2>AI Insights</h2><p>Những điều cần biết lúc này</p></div></div>{insights.map((insight, index) => { const Icon = insight.icon; return <div className="insight-row" key={index}><span className="insight-number">0{index + 1}</span><p>{insight.text}</p><Icon style={insight.warn ? { color: '#d18c26' } : undefined} /></div> })}</div>
    </div>
    <div className="card ask-ai">
      <div className="section-header"><div><div className="card-icon-title"><span className="ai-icon"><Sparkles /></span><div><h2>Hỏi Pompano AI</h2><p>Đặt câu hỏi về trang trại của bạn</p></div></div></div><div className="table-tools">{messages.length > 0 && <button className="outline-button" onClick={() => setMessages([])}><RotateCcw /> Cuộc trò chuyện mới</button>}<span className="demo-badge">Phân tích theo quy tắc</span></div></div>
      <div className="chat-window">
        {!messages.length && <div className="chat-message assistant"><span className="ai-icon"><Sparkles /></span><div><small>Pompano AI</small><p>Xin chào {profile.name}! Tôi đọc dữ liệu cảm biến trực tiếp, nhật ký cho ăn và sức khỏe để trả lời. Hãy hỏi về một ao (ví dụ “Ao {farmPonds[0]?.id ?? 'A01'}”), cảnh báo, thức ăn hoặc sức khỏe cá.</p></div></div>}
        {messages.map((message, index) => <div key={index} className={`chat-message ${message.role === 'user' ? 'user' : 'assistant'}`}>{message.role === 'user' ? <span className="avatar">{initials(profile.name)}</span> : <span className="ai-icon"><Sparkles /></span>}<div><small>{message.role === 'user' ? 'Bạn' : 'Pompano AI'}</small><p className="chat-text">{message.text}</p></div></div>)}
        {thinking && <div className="chat-message assistant"><span className="ai-icon"><Sparkles /></span><div><small>Pompano AI</small><p className="typing"><i /><i /><i /></p></div></div>}
        <div ref={endRef} />
      </div>
      <div className="quick-prompts">{prompts.map((prompt) => <button key={prompt} onClick={() => ask(prompt)} disabled={thinking}>{prompt}</button>)}</div>
      <form className="chat-input" onSubmit={(event) => { event.preventDefault(); ask(question) }}><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault() }} placeholder="Hỏi Pompano AI..." /><button type="submit" className="primary-button" disabled={!question.trim() || thinking} aria-label="Gửi"><ArrowUpRight /></button></form>
    </div>
  </section>
}
