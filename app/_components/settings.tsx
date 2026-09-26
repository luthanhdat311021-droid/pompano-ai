'use client'

import { useState } from 'react'
import { Download, RotateCcw, Save } from 'lucide-react'
import { initials, useFarm } from '@/lib/farm-store'
import { LIMITS, type Limits } from '@/lib/telemetry'
import { Field, downloadCsv, useAppUI } from './ui'

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (value: boolean) => void; label: string; description: string }) {
  return <button type="button" role="switch" aria-checked={checked} className="setting-row" onClick={() => onChange(!checked)}><span><strong>{label}</strong><small>{description}</small></span><span className={`toggle ${checked ? 'on' : ''}`} /></button>
}

function ProfileCard() {
  const { profile, updateProfile } = useFarm()
  const { notify } = useAppUI()
  const [values, setValues] = useState(profile)
  const [error, setError] = useState('')
  const dirty = values.name !== profile.name || values.role !== profile.role
  return <form className="card settings-card" onSubmit={(event) => {
    event.preventDefault()
    if (!values.name.trim()) return setError('Vui lòng nhập họ tên')
    setError('')
    updateProfile({ name: values.name.trim(), role: values.role.trim() || 'Thành viên' })
    notify('Đã lưu hồ sơ')
  }}>
    <div className="section-header"><div><h2>Hồ sơ cá nhân</h2><p>Tên hiển thị trên thanh bên và lời chào.</p></div><div className="avatar large-avatar">{initials(values.name || profile.name)}</div></div>
    <div className="form-grid">
      <Field label="Họ và tên" error={error}><input value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} /></Field>
      <Field label="Vai trò"><input value={values.role} onChange={(event) => setValues({ ...values, role: event.target.value })} /></Field>
    </div>
    <div className="card-actions"><button type="button" className="outline-button" disabled={!dirty} onClick={() => setValues(profile)}>Hủy</button><button type="submit" className="primary-button" disabled={!dirty}><Save /> Lưu hồ sơ</button></div>
  </form>
}

type LimitField = [keyof Limits, 'min' | 'max' | 'dangerMin' | 'dangerMax', string]
const LIMIT_FIELDS: LimitField[] = [
  ['ph', 'min', 'pH tối thiểu'], ['ph', 'max', 'pH tối đa'], ['ph', 'dangerMin', 'pH nguy hiểm dưới'], ['ph', 'dangerMax', 'pH nguy hiểm trên'],
  ['temp', 'min', 'Nhiệt độ tối thiểu (°C)'], ['temp', 'max', 'Nhiệt độ tối đa (°C)'], ['temp', 'dangerMin', 'Nhiệt độ nguy hiểm dưới'], ['temp', 'dangerMax', 'Nhiệt độ nguy hiểm trên'],
  ['oxygen', 'min', 'Oxy tối thiểu (mg/L)'], ['oxygen', 'dangerMin', 'Oxy nguy hiểm dưới (mg/L)'],
]

function toForm(limits: Limits) {
  return Object.fromEntries(LIMIT_FIELDS.map(([group, key]) => [`${group}.${key}`, String((limits[group] as Record<string, number>)[key])]))
}

function LimitsCard() {
  const { settings, updateSettings } = useFarm()
  const { notify, confirm } = useAppUI()
  const [values, setValues] = useState<Record<string, string>>(() => toForm(settings.limits))
  const [error, setError] = useState('')
  const save = (event: React.FormEvent) => {
    event.preventDefault()
    const n = (key: string) => Number(values[key])
    if (Object.values(values).some((value) => value.trim() === '' || !Number.isFinite(Number(value)))) return setError('Tất cả ngưỡng phải là số hợp lệ')
    const checks: [boolean, string][] = [
      [n('ph.dangerMin') <= n('ph.min') && n('ph.min') < n('ph.max') && n('ph.max') <= n('ph.dangerMax'), 'pH: nguy hiểm dưới ≤ tối thiểu < tối đa ≤ nguy hiểm trên'],
      [n('ph.dangerMin') >= 0 && n('ph.dangerMax') <= 14, 'pH phải nằm trong khoảng 0–14'],
      [n('temp.dangerMin') <= n('temp.min') && n('temp.min') < n('temp.max') && n('temp.max') <= n('temp.dangerMax'), 'Nhiệt độ: nguy hiểm dưới ≤ tối thiểu < tối đa ≤ nguy hiểm trên'],
      [n('oxygen.dangerMin') >= 0 && n('oxygen.dangerMin') <= n('oxygen.min'), 'Oxy: 0 ≤ nguy hiểm dưới ≤ tối thiểu'],
    ]
    const failed = checks.find(([ok]) => !ok)
    if (failed) return setError(failed[1])
    setError('')
    updateSettings({ limits: {
      ph: { min: n('ph.min'), max: n('ph.max'), dangerMin: n('ph.dangerMin'), dangerMax: n('ph.dangerMax') },
      temp: { min: n('temp.min'), max: n('temp.max'), dangerMin: n('temp.dangerMin'), dangerMax: n('temp.dangerMax') },
      oxygen: { min: n('oxygen.min'), dangerMin: n('oxygen.dangerMin') },
    } })
    notify('Đã cập nhật ngưỡng cảnh báo')
  }
  return <form className="card settings-card wide" onSubmit={save} noValidate>
    <div className="section-header"><div><h2>Ngưỡng cảnh báo</h2><p>Vượt ngưỡng an toàn → Cảnh báo; vượt ngưỡng nguy hiểm → Nguy hiểm. Áp dụng ngay cho dữ liệu trực tiếp.</p></div></div>
    <div className="form-grid four">{LIMIT_FIELDS.map(([group, key, label]) => { const id = `${group}.${key}`; return <Field key={id} label={label}><input type="number" step="0.1" value={values[id]} onChange={(event) => setValues({ ...values, [id]: event.target.value })} /></Field> })}</div>
    {error && <p className="field-error block">{error}</p>}
    <div className="card-actions"><button type="button" className="outline-button" onClick={() => confirm({ title: 'Khôi phục ngưỡng mặc định?', message: 'pH 7.5–8.5, nhiệt độ 26–30°C, oxy ≥ 5 mg/L.', confirmLabel: 'Khôi phục', onConfirm: () => { setValues(toForm(LIMITS)); updateSettings({ limits: LIMITS }); notify('Đã khôi phục ngưỡng mặc định') } })}><RotateCcw /> Mặc định</button><button type="submit" className="primary-button"><Save /> Lưu ngưỡng</button></div>
  </form>
}

function OperationsCard() {
  const { settings, updateSettings } = useFarm()
  const { notify } = useAppUI()
  const [price, setPrice] = useState(String(settings.feedPrice))
  const [error, setError] = useState('')
  return <div className="card settings-card">
    <div className="section-header"><div><h2>Giao diện & vận hành</h2><p>Tùy chỉnh hiển thị và thông báo.</p></div></div>
    <Toggle checked={settings.dark} onChange={(dark) => updateSettings({ dark })} label="Chế độ tối" description="Giảm chói khi theo dõi ban đêm" />
    <Toggle checked={settings.notifyWarnings} onChange={(notifyWarnings) => updateSettings({ notifyWarnings })} label="Thông báo mức Cảnh báo" description="Tắt để chỉ nhận thông báo Nguy hiểm và mất kết nối" />
    <form className="inline-form" onSubmit={(event) => {
      event.preventDefault()
      const value = Number(price)
      if (!Number.isFinite(value) || value <= 0) return setError('Giá phải lớn hơn 0')
      setError('')
      updateSettings({ feedPrice: Math.round(value) })
      notify('Đã cập nhật giá thức ăn')
    }}><Field label="Giá thức ăn (đ/kg)" error={error}><input type="number" min={1} value={price} onChange={(event) => setPrice(event.target.value)} /></Field><button type="submit" className="outline-button" disabled={Number(price) === settings.feedPrice}><Save /> Lưu</button></form>
  </div>
}

function DataCard() {
  const { reset, farms, ponds, feedLogs, healthLogs } = useFarm()
  const { confirm, notify, navigate } = useAppUI()
  return <div className="card settings-card">
    <div className="section-header"><div><h2>Dữ liệu</h2><p>Dữ liệu quản lý đang lưu trong trình duyệt này.</p></div></div>
    <ul className="data-summary"><li><span>Trang trại</span><strong>{farms.length}</strong></li><li><span>Ao nuôi</span><strong>{ponds.length}</strong></li><li><span>Bản ghi cho ăn</span><strong>{feedLogs.length}</strong></li><li><span>Bản ghi sức khỏe</span><strong>{healthLogs.length}</strong></li></ul>
    <div className="card-actions">
      <button type="button" className="outline-button" onClick={() => { downloadCsv('ao-nuoi.csv', [['Mã ao', 'Tên', 'Trang trại', 'Số cá', 'Diện tích (m²)', 'Ngày thả'], ...ponds.map((pond) => [pond.id, pond.name, farms.find((farm) => farm.id === pond.farmId)?.name ?? pond.farmId, pond.fish, pond.area, pond.stockedAt])]); notify('Đã xuất danh sách ao') }}><Download /> Xuất danh sách ao</button>
      <button type="button" className="danger-button" onClick={() => confirm({ title: 'Khôi phục dữ liệu mẫu?', message: 'Mọi ao, nhật ký, thông báo và cài đặt bạn đã thay đổi sẽ bị thay bằng dữ liệu mẫu ban đầu. Dữ liệu cảm biến không bị ảnh hưởng.', confirmLabel: 'Khôi phục', danger: true, onConfirm: () => { reset(); navigate('Tổng quan'); notify('Đã khôi phục dữ liệu mẫu') } })}><RotateCcw /> Khôi phục dữ liệu mẫu</button>
    </div>
  </div>
}

export function SettingsPage() {
  return <section className="settings-grid"><ProfileCard /><OperationsCard /><LimitsCard /><DataCard /></section>
}
