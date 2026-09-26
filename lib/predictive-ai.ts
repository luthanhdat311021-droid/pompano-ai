// Predictive AI Engine for Aquaculture Telemetry & Energy Optimization
// Calculates 1h/2h/4h forecasts, Nighttime Suffocation Risk, Smart Aeration Control, and VietGAP Traceability.

import { LIMITS, type Limits, type Reading } from './telemetry'

export type MetricForecast = {
  current: number
  predicted1h: number
  predicted2h: number
  predicted4h: number
  slopePerHour: number
  trend: 'stable' | 'rising' | 'dropping' | 'dropping_dangerously'
}

export type PredictivePondInsight = {
  pondId: string
  oxygen: MetricForecast
  ph: MetricForecast
  temp: MetricForecast
  riskLevel: 'safe' | 'warning' | 'critical'
  riskTitle: string
  riskDetail: string
  recommendedAeratorTime: string
  estimatedPowerSavedKwh: number
  estimatedMoneySavedVnd: number
  actionableSteps: string[]
}

export function predictPondMetrics(
  pondId: string,
  readings: Reading[],
  latest?: Reading,
  limits: Limits = LIMITS
): PredictivePondInsight {
  const current = latest || readings[readings.length - 1]
  
  // Default values if insufficient history
  if (!current || readings.length < 3) {
    const fallback: MetricForecast = {
      current: current?.oxygen ?? 6.0,
      predicted1h: current?.oxygen ?? 6.0,
      predicted2h: current?.oxygen ?? 6.0,
      predicted4h: current?.oxygen ?? 6.0,
      slopePerHour: 0,
      trend: 'stable'
    }
    return {
      pondId,
      oxygen: fallback,
      ph: { ...fallback, current: current?.ph ?? 7.8, predicted1h: 7.8, predicted2h: 7.8, predicted4h: 7.8 },
      temp: { ...fallback, current: current?.temp ?? 28.0, predicted1h: 28.0, predicted2h: 28.0, predicted4h: 28.0 },
      riskLevel: 'safe',
      riskTitle: 'Đang thu thập dữ liệu chuỗi thời gian',
      riskDetail: 'Hệ thống đang tích lũy thêm các bản ghi cảm biến để tính toán đường cong xu hướng AI chính xác.',
      recommendedAeratorTime: 'Tự động theo lịch cố định (22:00 - 04:00)',
      estimatedPowerSavedKwh: 0,
      estimatedMoneySavedVnd: 0,
      actionableSteps: ['Duy trì vận hành bình thường', 'Đảm bảo thiết bị ESP32 gửi dữ liệu liên tục']
    }
  }

  // Calculate Linear Regression slope over recent window (last 20 readings or last 30 minutes)
  const window = readings.slice(-60)
  const startTime = window[0].ts
  
  function getSlope(metric: 'oxygen' | 'ph' | 'temp') {
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0
    const n = window.length
    for (const r of window) {
      const x = (r.ts - startTime) / 3600000 // in hours
      const y = r[metric]
      sumX += x
      sumY += y
      sumXY += x * y
      sumXX += x * x
    }
    const denominator = n * sumXX - sumX * sumX
    if (Math.abs(denominator) < 1e-6) return 0
    return (n * sumXY - sumX * sumY) / denominator // unit change per hour
  }

  // Diurnal bio-oxygen demand adjustment (oxygen drops faster during 22:00 - 05:00 due to algae respiration)
  const currentHour = new Date().getHours()
  const isNight = currentHour >= 21 || currentHour <= 5
  const nightOxyDrift = isNight ? -0.15 : 0 // extra DO drop per hour at night

  const oxySlope = getSlope('oxygen') + nightOxyDrift
  const phSlope = getSlope('ph')
  const tempSlope = getSlope('temp')

  const oxy1h = Math.max(0, current.oxygen + oxySlope * 1)
  const oxy2h = Math.max(0, current.oxygen + oxySlope * 2)
  const oxy4h = Math.max(0, current.oxygen + oxySlope * 4)

  const ph1h = Math.min(14, Math.max(0, current.ph + phSlope * 1))
  const ph2h = Math.min(14, Math.max(0, current.ph + phSlope * 2))
  const ph4h = Math.min(14, Math.max(0, current.ph + phSlope * 4))

  const temp1h = current.temp + tempSlope * 1
  const temp2h = current.temp + tempSlope * 2
  const temp4h = current.temp + tempSlope * 4

  const oxyTrend = oxySlope < -0.3 ? 'dropping_dangerously' : oxySlope < -0.05 ? 'dropping' : oxySlope > 0.05 ? 'rising' : 'stable'
  const phTrend = phSlope < -0.1 ? 'dropping' : phSlope > 0.1 ? 'rising' : 'stable'
  const tempTrend = tempSlope < -0.2 ? 'dropping' : tempSlope > 0.2 ? 'rising' : 'stable'

  const oxygenForecast: MetricForecast = {
    current: current.oxygen,
    predicted1h: Number(oxy1h.toFixed(2)),
    predicted2h: Number(oxy2h.toFixed(2)),
    predicted4h: Number(oxy4h.toFixed(2)),
    slopePerHour: Number(oxySlope.toFixed(2)),
    trend: oxyTrend
  }

  const phForecast: MetricForecast = {
    current: current.ph,
    predicted1h: Number(ph1h.toFixed(2)),
    predicted2h: Number(ph2h.toFixed(2)),
    predicted4h: Number(ph4h.toFixed(2)),
    slopePerHour: Number(phSlope.toFixed(2)),
    trend: phTrend
  }

  const tempForecast: MetricForecast = {
    current: current.temp,
    predicted1h: Number(temp1h.toFixed(1)),
    predicted2h: Number(temp2h.toFixed(1)),
    predicted4h: Number(temp4h.toFixed(1)),
    slopePerHour: Number(tempSlope.toFixed(2)),
    trend: tempTrend
  }

  // Risk evaluation
  let riskLevel: 'safe' | 'warning' | 'critical' = 'safe'
  let riskTitle = 'Chỉ số ổn định & An toàn'
  let riskDetail = 'Thuật toán AI dự báo chất lượng nước sẽ tiếp tục duy trì trong ngưỡng tối ưu trong 4 giờ tới.'
  let recommendedAeratorTime = 'Chạy sục khí duy trì 2-3 tiếng/đêm (02:00 - 05:00)'
  let actionableSteps = [
    'Duy trì lịch cho ăn tiêu chuẩn',
    'AI chưa phát hiện nguy cơ ngạt khí ban đêm'
  ]

  if (oxy2h < limits.oxygen.dangerMin || oxy4h < 3.8) {
    riskLevel = 'critical'
    riskTitle = '🚨 NGUY CƠ TỤT OXY NGHÊM TRỌNG TRONG 2-4 GIỜ TỚI'
    riskDetail = `Mô hình AI phát hiện tốc độ giảm Oxy (${oxySlope.toFixed(2)} mg/L/giờ). Dự báo Oxy sẽ rơi xuống ${oxy2h.toFixed(2)} mg/L lúc ${getFutureTimeString(2)} (ngưỡng nguy hiểm < ${limits.oxygen.dangerMin} mg/L).`
    recommendedAeratorTime = 'KÍCH HOẠT QUẠT NƯỚC NGAY LẬP TỨC (Chạy tối đa công suất)'
    actionableSteps = [
      'Bật bổ sung tất cả dàn quạt nước sục khí lập tức',
      'Cắt giảm 50% lượng thức ăn đợt tiếp theo để tránh tiêu thụ oxy sinh học (BOD)',
      'Tạt oxy viên cấp cứu (Sodium Percarbonate) nếu oxy xuống dưới 3.5 mg/L'
    ]
  } else if (oxy4h < limits.oxygen.min || oxySlope < -0.15) {
    riskLevel = 'warning'
    riskTitle = '⚠️ XU HƯỚNG GIẢM OXY BAN ĐÊM (CẦN CHÚ Ý)'
    riskDetail = `Dự báo Oxy hòa tan sẽ giảm xuống ${oxy4h.toFixed(2)} mg/L trong 4 giờ tới. Cần chủ động bật sục khí sớm hơn lịch cố định.`
    recommendedAeratorTime = `Bật quạt nước tự động lúc ${getFutureTimeString(1.5)} đến 06:00 sáng`
    actionableSteps = [
      'Cài đặt hẹn giờ bật quạt nước tự động từ 23:00',
      'Theo dõi sát chỉ số trên Dashboard trong 60 phút tới'
    ]
  } else if (ph4h > limits.ph.max || ph4h < limits.ph.min) {
    riskLevel = 'warning'
    riskTitle = '⚠️ DỰ BÁO BIẾN ĐỘNG pH NƯỚC'
    riskDetail = `pH đang có xu hướng ${phSlope > 0 ? 'tăng vọt' : 'tụt giảm'} (${phSlope.toFixed(2)}/giờ). Dự báo đạt ${ph4h.toFixed(2)} trong 4h tới.`
    recommendedAeratorTime = 'Vận hành sục khí bình thường'
    actionableSteps = [
      phSlope > 0 ? 'Tạt mật đường hoặc vi sinh lúc 8-9h sáng để hạ pH' : 'Tạt vôi nông nghiệp CaCO3 (10-15kg/1000m3) để nâng pH'
    ]
  }

  // Energy savings calculation:
  // Standard fixed schedule = 8 hours aerator running per night (approx 3.75 kW motor = 30 kWh)
  // Smart AI Aeration = Runs only when DO is predicted < 5.2 mg/L (avg 5.5 hours = 20.6 kWh)
  // Saved ~ 9.4 kWh/day per pond -> ~282 kWh/month -> ~700,000 VND/month/pond
  const hoursSavedPerDay = riskLevel === 'safe' ? 2.5 : riskLevel === 'warning' ? 1.5 : 0
  const kwMotor = 3.75 // Standard 5HP paddlewheel aerator
  const estimatedPowerSavedKwh = Number((hoursSavedPerDay * kwMotor * 30).toFixed(0))
  const estimatedMoneySavedVnd = estimatedPowerSavedKwh * 2500 // ~2500 VND per kWh commercial rate

  return {
    pondId,
    oxygen: oxygenForecast,
    ph: phForecast,
    temp: tempForecast,
    riskLevel,
    riskTitle,
    riskDetail,
    recommendedAeratorTime,
    estimatedPowerSavedKwh,
    estimatedMoneySavedVnd,
    actionableSteps
  }
}

function getFutureTimeString(hoursAhead: number): string {
  const d = new Date(Date.now() + hoursAhead * 3600000)
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}
