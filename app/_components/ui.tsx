'use client'

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Waves, X } from 'lucide-react'
import type { Pond } from '@/lib/farm-store'

// ---------- App-level UI context (navigation, toasts, dialogs) ----------

export type FormRequest = { kind: 'pond'; pond?: Pond } | { kind: 'feed'; pondId?: string } | { kind: 'health'; pondId?: string }
export type ConfirmRequest = { title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void }
export type RangeKey = '5m' | '15m' | '1h'

export const RANGES: Record<RangeKey, { label: string; ms: number }> = {
  '5m': { label: '5 phút qua', ms: 5 * 60_000 },
  '15m': { label: '15 phút qua', ms: 15 * 60_000 },
  '1h': { label: '1 giờ qua', ms: 60 * 60_000 },
}

type AppUI = {
  active: string
  navigate: (page: string) => void
  notify: (message: string) => void
  openForm: (form: FormRequest) => void
  confirm: (request: ConfirmRequest) => void
  range: RangeKey
  setRange: (range: RangeKey) => void
}

export const AppUIContext = createContext<AppUI | null>(null)

export function useAppUI() {
  const value = useContext(AppUIContext)
  if (!value) throw new Error('useAppUI must be used inside AppUIContext')
  return value
}

// Overlays render into a node inside .app-shell so they inherit the theme variables.
// Overlays only open after user interaction, so `document` is always available here.
function OverlayPortal({ children }: { children: React.ReactNode }) {
  const [target] = useState(() => (typeof document === 'undefined' ? null : document.getElementById('overlay-root') ?? document.body))
  return target ? createPortal(children, target) : null
}

// ---------- Popover / dropdown menu ----------

type PopoverProps = {
  trigger: React.ReactNode
  triggerClassName?: string
  label: string
  align?: 'left' | 'right'
  width?: number
  children: (close: () => void) => React.ReactNode
}

export function Popover({ trigger, triggerClassName = 'icon-button', label, align = 'right', width = 200, children }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const close = () => setOpen(false)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const panelWidth = Math.min(width, window.innerWidth - 16)
    let left = align === 'right' ? rect.right - panelWidth : rect.left
    left = Math.max(8, Math.min(left, window.innerWidth - panelWidth - 8))
    const panelHeight = panelRef.current?.offsetHeight ?? 0
    const below = rect.bottom + 6
    const top = below + panelHeight > window.innerHeight - 8 && rect.top - panelHeight - 6 > 8 ? rect.top - panelHeight - 6 : below
    setPosition({ top, left, width: panelWidth })
  }, [open, align, width])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) close()
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    const onScroll = (event: Event) => { if (!panelRef.current?.contains(event.target as Node)) close() }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return <>
    <button ref={triggerRef} type="button" className={`${triggerClassName} ${open ? 'is-open' : ''}`} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={(event) => { event.stopPropagation(); setOpen(!open) }}>{trigger}</button>
    {open && <OverlayPortal><div ref={panelRef} className="popover" role="menu" style={position} onClick={(event) => event.stopPropagation()}>{children(close)}</div></OverlayPortal>}
  </>
}

export type MenuItem = { label: string; icon?: React.ElementType; onSelect: () => void; danger?: boolean; checked?: boolean; hint?: string } | 'separator'

export function Menu({ items, ...props }: Omit<PopoverProps, 'children'> & { items: MenuItem[] }) {
  return <Popover {...props}>{(close) => <div className="menu-list">{items.map((item, index) => {
    if (item === 'separator') return <div className="menu-separator" key={`sep-${index}`} />
    const Icon = item.icon
    return <button type="button" role="menuitem" key={item.label} className={`menu-item ${item.danger ? 'danger' : ''}`} onClick={() => { close(); item.onSelect() }}>
      {Icon ? <Icon /> : item.checked !== undefined ? <span className="menu-check">{item.checked && <Check />}</span> : null}
      <span>{item.label}</span>
      {item.hint && <small>{item.hint}</small>}
    </button>
  })}</div>}</Popover>
}

// ---------- Modal ----------

export function Modal({ title, description, onClose, children, footer, size = 'md' }: { title: string; description?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  // Runs once per open: parents re-render every second (live data), which must not steal focus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeRef.current() }
    document.addEventListener('keydown', onKey)
    const focusable = panelRef.current?.querySelector<HTMLElement>('input:not([disabled]), select, textarea, button.primary-button, button.danger-button')
    focusable?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  return <OverlayPortal><div className="modal-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={panelRef} className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><X /></button></div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-actions">{footer}</div>}
    </div>
  </div></OverlayPortal>
}

export function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose: () => void }) {
  return <Modal title={request.title} onClose={onClose} size="sm" footer={<><button type="button" className="outline-button" onClick={onClose}>Hủy</button><button type="button" className={request.danger ? 'danger-button' : 'primary-button'} onClick={() => { request.onConfirm(); onClose() }}>{request.confirmLabel}</button></>}>
    <p className="modal-text">{request.message}</p>
  </Modal>
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return <label className={`field ${error ? 'has-error' : ''}`}><span>{label}</span>{children}{error ? <small className="field-error">{error}</small> : hint ? <small>{hint}</small> : null}</label>
}

export function Toast({ message }: { message: string }) {
  return <div className="toast" role="status"><Check /> {message}</div>
}

// ---------- Small shared pieces ----------

export function StatusBadge({ children, tone = 'green' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`status-badge ${tone}`}><span className="status-dot" />{children}</span>
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return <div className="brand"><div className="brand-mark"><Waves /></div>{!compact && <div><strong>POMPANO <em>AI</em></strong><small>Smart aquaculture</small></div>}</div>
}

export function StatCard({ label, value, detail, trend, negative }: { label: string; value: string; detail: string; trend?: string; negative?: boolean }) {
  return <article className="stat-card"><div className="stat-meta"><span>{label}</span><strong>{value}</strong><small>{trend && <span className={negative ? 'negative' : 'positive'}>{trend}</span>} <span>{detail}</span></small></div></article>
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: React.ElementType; title: string; text: string; action?: React.ReactNode }) {
  return <div className="empty-state"><span className="ai-icon"><Icon /></span><strong>{title}</strong><p>{text}</p>{action}</div>
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('vi-VN', { hour12: false })
}

export function formatDateTime(ts: number) {
  const date = new Date(ts)
  const sameDay = new Date().toDateString() === date.toDateString()
  return `${date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })} ${sameDay ? 'hôm nay' : date.toLocaleDateString('vi-VN')}`
}

export function formatNumber(value: number, digits = 0) {
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
