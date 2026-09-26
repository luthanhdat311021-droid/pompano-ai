// Virtual ESP32 boards: one per pond, each POSTing sensor readings to the dashboard
// using exactly the same HTTP contract a real ESP32 will use.
//
//   node scripts/virtual-esp32.mjs [--url http://localhost:3000/api/telemetry] [--interval 2000]
//
// Set DEVICE_TOKEN (same value as the server) to send the x-device-key header.

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []),
)
const URL = args.url ?? 'http://localhost:3000/api/telemetry'
const INTERVAL = Number(args.interval ?? 2000)
const TOKEN = process.env.DEVICE_TOKEN

// Baselines per pond. A02 sits close to the pH limit so warnings come and go naturally.
const boards = [
  { deviceId: 'ESP32-A01', pondId: 'A01', base: { ph: 7.8, temp: 28.2, oxygen: 6.2 } },
  { deviceId: 'ESP32-A02', pondId: 'A02', base: { ph: 8.42, temp: 28.9, oxygen: 5.6 } },
  { deviceId: 'ESP32-A03', pondId: 'A03', base: { ph: 7.7, temp: 28.0, oxygen: 6.4 } },
  { deviceId: 'ESP32-A04', pondId: 'A04', base: { ph: 7.6, temp: 27.8, oxygen: 6.0 } },
].map((board) => ({ ...board, value: { ...board.base }, event: null, offlineUntil: 0 }))

const NOISE = { ph: 0.03, temp: 0.08, oxygen: 0.08 }

function gaussian() {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())
}

function step(board) {
  // Rare incidents: oxygen crash, pH spike or heat build-up lasting ~1 minute.
  if (!board.event && Math.random() < 0.004) {
    const kinds = [
      { metric: 'oxygen', target: -1.8, label: 'oxy tụt' },
      { metric: 'ph', target: 0.6, label: 'pH tăng vọt' },
      { metric: 'temp', target: 2.4, label: 'nhiệt độ tăng' },
    ]
    board.event = { ...kinds[Math.floor(Math.random() * kinds.length)], ticksLeft: Math.round(60_000 / INTERVAL) }
    console.log(`\n[${board.deviceId}] ⚠ sự cố mô phỏng: ${board.event.label}`)
  }

  // Warmer water in the afternoon, cooler at night.
  const hour = new Date().getHours() + new Date().getMinutes() / 60
  const diurnal = Math.sin(((hour - 8) / 24) * 2 * Math.PI) * 0.6

  for (const metric of ['ph', 'temp', 'oxygen']) {
    let target = board.base[metric] + (metric === 'temp' ? diurnal : metric === 'oxygen' ? -diurnal * 0.4 : 0)
    if (board.event?.metric === metric) target += board.event.target
    // Mean-reverting random walk: drifts toward the target with sensor noise on top.
    board.value[metric] += (target - board.value[metric]) * 0.12 + gaussian() * NOISE[metric]
  }

  if (board.event && --board.event.ticksLeft <= 0) board.event = null
}

async function send(board) {
  const payload = {
    deviceId: board.deviceId,
    pondId: board.pondId,
    ph: Number(board.value.ph.toFixed(2)),
    temp: Number(board.value.temp.toFixed(1)),
    oxygen: Number(board.value.oxygen.toFixed(2)),
  }
  const response = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(TOKEN ? { 'x-device-key': TOKEN } : {}) },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return payload
}

async function run(board) {
  const now = Date.now()
  step(board)
  // Occasionally a board drops off Wi-Fi for ~20s so the dashboard can show "offline".
  if (board.offlineUntil < now && Math.random() < 0.002) {
    board.offlineUntil = now + 20_000
    console.log(`\n[${board.deviceId}] ✕ mất Wi-Fi mô phỏng (20 giây)`)
  }
  if (board.offlineUntil > now) return `${board.pondId} offline`
  try {
    const p = await send(board)
    return `${p.pondId} pH ${p.ph.toFixed(2)} T ${p.temp.toFixed(1)} DO ${p.oxygen.toFixed(2)}`
  } catch (error) {
    return `${board.pondId} lỗi (${error.cause?.code ?? error.message})`
  }
}

async function loop() {
  const started = Date.now()
  const line = await Promise.all(boards.map(run))
  process.stdout.write(`\r${new Date().toLocaleTimeString('vi-VN')}  ${line.join(' | ')}   `)
  // Schedule after the round finishes so a slow server never makes requests pile up.
  setTimeout(loop, Math.max(0, INTERVAL - (Date.now() - started)))
}

console.log(`Virtual ESP32 × ${boards.length} → ${URL} mỗi ${INTERVAL} ms (Ctrl+C để dừng)`)
loop()
