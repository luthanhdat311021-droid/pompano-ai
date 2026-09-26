import { parseReading } from '@/lib/telemetry'
import { ingest, snapshot } from '@/lib/telemetry-store'

export const dynamic = 'force-dynamic'

// ESP32 (real or virtual) posts here:
// POST /api/telemetry  { "deviceId": "ESP32-A01", "pondId": "A01", "ph": 7.8, "temp": 28.4, "oxygen": 6.1 }
export async function POST(request: Request) {
  const token = process.env.DEVICE_TOKEN
  if (token && request.headers.get('x-device-key') !== token) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  const reading = parseReading(await request.json().catch(() => null))
  if (!reading) return Response.json({ error: 'invalid payload' }, { status: 400 })
  ingest(reading)
  return Response.json({ ok: true, ts: reading.ts })
}

export function GET() {
  return Response.json(snapshot())
}
