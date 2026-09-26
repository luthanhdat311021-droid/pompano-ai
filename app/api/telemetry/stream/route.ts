import { snapshot, subscribe } from '@/lib/telemetry-store'

export const dynamic = 'force-dynamic'

// Server-Sent Events: pushes every new reading to connected dashboards.
export function GET(request: Request) {
  const encoder = new TextEncoder()
  let cleanup = () => {}

  const stream = new ReadableStream({
    start(controller) {
      const write = (chunk: string) => {
        try { controller.enqueue(encoder.encode(chunk)) } catch { cleanup() }
      }
      const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

      send('snapshot', snapshot())
      const unsubscribe = subscribe((reading) => send('reading', reading))
      const ping = setInterval(() => write(': ping\n\n'), 15_000)

      cleanup = () => {
        unsubscribe()
        clearInterval(ping)
        try { controller.close() } catch {}
      }
      request.signal.addEventListener('abort', () => cleanup())
    },
    cancel() { cleanup() },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
