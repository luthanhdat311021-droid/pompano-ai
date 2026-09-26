// Short-term water quality forecast (2h / 4h) from recent sensor trends.
//
// This is a trend extrapolation, not a trained model: a least-squares slope over
// the last 30 minutes, capped to physically plausible rates, plus extra night-time
// oxygen consumption (algae respiration). Results are clamped to realistic ranges.

import { LIMITS, type Limits, type Reading } from './telemetry'

type Metric = 'oxygen' | 'ph' | 'temp'

export type MetricForecast = {
  current: number
  in2h: number
  in4h: number
  slopePerHour: number
}

export type RiskLevel = 'safe' | 'warning' | 'critical'

export type PondForecast = {
  pondId: string
  ready: boolean
  spanMinutes: number
  samples: number
  oxygen: MetricForecast
  ph: MetricForecast
  temp: MetricForecast
  risk: RiskLevel
  title: string
  detail: string
  aeration: string
  steps: string[]
}

const HOUR = 3_600_000
const WINDOW_MS = 30 * 60_000
export const MIN_SPAN_MS = 10 * 60_000
const MIN_SAMPLES = 30
// Fastest changes that are realistic for a pond, per hour. Steeper fitted slopes are sensor noise.
const MAX_SLOPE: Record<Metric, number> = { oxygen: 0.8, ph: 0.15, temp: 1 }
const BOUNDS: Record<Metric, [number, number]> = { oxygen: [0, 15], ph: [6, 10], temp: [15, 40] }
const NIGHT_OXYGEN_DROP = 0.15 // extra mg/L per hour between 21:00 and 05:00

const clamp = (value: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, value))
const round = (value: number, digits: number) => Number(value.toFixed(digits))

function isNight(ts: number) {
  const hour = new Date(ts).getHours()
  return hour >= 21 || hour < 5
}

// Extra oxygen consumed by night-time respiration over the next `hours`, in 15-minute steps.
function nightDrift(from: number, hours: number) {
  let drift = 0
  for (let t = 0; t < hours; t += 0.25) if (isNight(from + t * HOUR)) drift -= NIGHT_OXYGEN_DROP * 0.25
  return drift
}

function slope(window: Reading[], metric: Metric) {
  const t0 = window[0].ts
  let sx = 0, sy = 0, sxy = 0, sxx = 0
  for (const reading of window) {
    const x = (reading.ts - t0) / HOUR
    sx += x; sy += reading[metric]; sxy += x * reading[metric]; sxx += x * x
  }
  const n = window.length
  const denominator = n * sxx - sx * sx
  if (Math.abs(denominator) < 1e-9) return 0
  const raw = (n * sxy - sx * sy) / denominator
  return Math.max(-MAX_SLOPE[metric], Math.min(MAX_SLOPE[metric], raw))
}

function formatClock(ts: number) {
  return new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function forecastPond(pondId: string, readings: Reading[], limits: Limits = LIMITS): PondForecast {
  const last = readings.at(-1)
  const window = last ? readings.filter((reading) => reading.ts >= last.ts - WINDOW_MS) : []
  const spanMs = window.length ? window[window.length - 1].ts - window[0].ts : 0
  // Average the last minute so a single noisy reading doesn't move the forecast.
  const recent = last ? window.filter((reading) => reading.ts >= last.ts - 60_000) : []
  const mean = (metric: Metric) => recent.reduce((sum, reading) => sum + reading[metric], 0) / (recent.length || 1)

  const build = (metric: Metric, digits: number, ready: boolean): MetricForecast => {
    const current = last ? mean(metric) : NaN
    if (!ready) return { current: round(current, digits), in2h: NaN, in4h: NaN, slopePerHour: 0 }
    const rate = slope(window, metric)
    const at = (hours: number) => round(clamp(current + rate * hours + (metric === 'oxygen' ? nightDrift(last!.ts, hours) : 0), BOUNDS[metric]), digits)
    return { current: round(current, digits), in2h: at(2), in4h: at(4), slopePerHour: round(rate, 2) }
  }

  const ready = !!last && spanMs >= MIN_SPAN_MS && window.length >= MIN_SAMPLES
  const oxygen = build('oxygen', 2, ready)
  const ph = build('ph', 2, ready)
  const temp = build('temp', 1, ready)
  const base = { pondId, ready, spanMinutes: Math.floor(spanMs / 60_000), samples: window.length, oxygen, ph, temp }

  if (!ready) {
    return { ...base, risk: 'safe', title: 'Đang thu thập dữ liệu', detail: `Cần ít nhất ${MIN_SPAN_MS / 60_000} phút dữ liệu liên tục để ước tính xu hướng (hiện có ${base.spanMinutes} phút).`, aeration: 'Vận hành quạt nước theo lịch thường', steps: [] }
  }

  const now = last!.ts
  // First time (within 4h) the oxygen forecast drops below `threshold`.
  const crossing = (threshold: number) => {
    for (let h = 0; h <= 4; h += 0.25) {
      const value = oxygen.current + oxygen.slopePerHour * h + nightDrift(now, h)
      if (value < threshold) return now + h * HOUR
    }
    return null
  }

  if (oxygen.in2h < limits.oxygen.dangerMin) {
    const at = crossing(limits.oxygen.dangerMin)
    return { ...base, risk: 'critical', title: 'Nguy cơ thiếu oxy trong 2 giờ tới', detail: `Oxy đang giảm ${Math.abs(oxygen.slopePerHour).toFixed(2)} mg/L/giờ, ước tính còn ${oxygen.in2h.toFixed(2)} mg/L sau 2 giờ${at ? `, xuống dưới ngưỡng nguy hiểm ${limits.oxygen.dangerMin} mg/L khoảng ${formatClock(at)}` : ''}.`, aeration: 'Bật toàn bộ quạt nước ngay', steps: ['Bật tất cả quạt nước / máy sục khí', 'Tạm giảm 50% thức ăn cữ tiếp theo', 'Chuẩn bị oxy viên nếu oxy xuống dưới 3.5 mg/L'] }
  }
  if (oxygen.in4h < limits.oxygen.min) {
    const at = crossing(limits.oxygen.min)
    return { ...base, risk: 'warning', title: 'Oxy có xu hướng giảm', detail: `Ước tính oxy còn ${oxygen.in4h.toFixed(2)} mg/L sau 4 giờ, dưới mức tối thiểu ${limits.oxygen.min} mg/L.`, aeration: at ? `Bật quạt nước sớm, trước ${formatClock(at)}` : 'Bật quạt nước sớm hơn lịch thường', steps: ['Bật quạt nước sớm hơn lịch', 'Theo dõi oxy trong 60 phút tới'] }
  }
  if (ph.in4h > limits.ph.max || ph.in4h < limits.ph.min) {
    const rising = ph.slopePerHour > 0
    return { ...base, risk: 'warning', title: `pH có xu hướng ${rising ? 'tăng' : 'giảm'}`, detail: `pH thay đổi ${ph.slopePerHour > 0 ? '+' : ''}${ph.slopePerHour.toFixed(2)}/giờ, ước tính đạt ${ph.in4h.toFixed(2)} sau 4 giờ (ngưỡng ${limits.ph.min}–${limits.ph.max}).`, aeration: 'Vận hành quạt nước theo lịch thường', steps: [rising ? 'Cân nhắc tạt mật đường hoặc vi sinh để hạ pH' : 'Cân nhắc bón vôi CaCO₃ để nâng pH'] }
  }
  if (temp.in4h > limits.temp.max || temp.in4h < limits.temp.min) {
    const rising = temp.slopePerHour > 0
    return { ...base, risk: 'warning', title: `Nhiệt độ có xu hướng ${rising ? 'tăng' : 'giảm'}`, detail: `Ước tính ${temp.in4h.toFixed(1)}°C sau 4 giờ (ngưỡng ${limits.temp.min}–${limits.temp.max}°C).`, aeration: rising ? 'Tăng sục khí vào giờ nắng gắt' : 'Vận hành quạt nước theo lịch thường', steps: [rising ? 'Cấp thêm nước mới hoặc che mát' : 'Hạn chế thay nước vào ban đêm'] }
  }
  return { ...base, risk: 'safe', title: 'Ổn định trong 4 giờ tới', detail: 'Xu hướng hiện tại cho thấy các chỉ số vẫn nằm trong ngưỡng an toàn.', aeration: isNight(now) ? 'Duy trì quạt nước theo lịch ban đêm' : 'Vận hành quạt nước theo lịch thường', steps: [] }
}

const RISK_RANK: Record<RiskLevel, number> = { critical: 0, warning: 1, safe: 2 }

// The pond most in need of attention: highest risk first, then lowest forecast oxygen.
export function riskiestForecast(forecasts: PondForecast[]) {
  const ready = forecasts.filter((forecast) => forecast.ready)
  const pool = ready.length ? ready : forecasts
  return [...pool].sort((a, b) => RISK_RANK[a.risk] - RISK_RANK[b.risk] || (a.oxygen.in4h || Infinity) - (b.oxygen.in4h || Infinity))[0]
}
