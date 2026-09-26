'use client'

import { useState } from 'react'
import { CONDITION_LABEL, FEED_TYPES, useFarm, type HealthCondition, type Pond } from '@/lib/farm-store'
import { Field, Modal, useAppUI, type FormRequest } from './ui'

function toLocalInput(ts: number) {
  const date = new Date(ts - new Date(ts).getTimezoneOffset() * 60_000)
  return date.toISOString().slice(0, 16)
}

function FormFooter({ onClose, submitLabel, form }: { onClose: () => void; submitLabel: string; form: string }) {
  return <><button type="button" className="outline-button" onClick={onClose}>Hủy</button><button type="submit" form={form} className="primary-button">{submitLabel}</button></>
}

function PondForm({ pond, onClose }: { pond?: Pond; onClose: () => void }) {
  const { ponds, farm, addPond, updatePond } = useFarm()
  const { notify, navigate } = useAppUI()
  const [values, setValues] = useState({
    id: pond?.id ?? '',
    name: pond?.name ?? '',
    fish: pond ? String(pond.fish) : '',
    area: pond ? String(pond.area) : '',
    stockedAt: pond?.stockedAt ?? new Date().toISOString().slice(0, 10),
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [key]: key === 'id' ? event.target.value.toUpperCase() : event.target.value })

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    const fish = Number(values.fish)
    const area = Number(values.area)
    if (!pond) {
      if (!/^[A-Z]\d{2}$/.test(values.id)) next.id = 'Mã gồm 1 chữ cái và 2 chữ số, ví dụ A05'
      else if (ponds.some((item) => item.id === values.id)) next.id = `Mã ${values.id} đã tồn tại`
    }
    if (!values.name.trim()) next.name = 'Vui lòng nhập tên ao'
    if (!Number.isInteger(fish) || fish <= 0) next.fish = 'Số cá phải là số nguyên lớn hơn 0'
    if (!Number.isFinite(area) || area <= 0) next.area = 'Diện tích phải lớn hơn 0'
    if (!values.stockedAt) next.stockedAt = 'Vui lòng chọn ngày thả'
    setErrors(next)
    if (Object.keys(next).length) return
    const data = { id: values.id, name: values.name.trim(), fish, area, stockedAt: values.stockedAt }
    if (pond) {
      updatePond(data)
      notify(`Đã cập nhật ${data.name}`)
    } else {
      addPond(data)
      notify(`Đã thêm ${data.name} vào ${farm.name}`)
      navigate(`pond:${data.id}`)
    }
    onClose()
  }

  return <Modal title={pond ? `Chỉnh sửa ${pond.name}` : 'Thêm ao nuôi'} description={pond ? 'Cập nhật thông tin ao nuôi.' : `Ao mới sẽ thuộc ${farm.name}. Thiết bị ESP32 gửi dữ liệu với pondId trùng mã ao.`} onClose={onClose} footer={<FormFooter onClose={onClose} submitLabel={pond ? 'Lưu thay đổi' : 'Thêm ao'} form="pond-form" />}>
    <form id="pond-form" className="form-grid" onSubmit={submit} noValidate>
      <Field label="Mã ao" error={errors.id} hint={pond ? 'Không thể đổi mã ao' : undefined}><input value={values.id} onChange={set('id')} disabled={!!pond} maxLength={3} placeholder="A05" /></Field>
      <Field label="Tên ao" error={errors.name}><input value={values.name} onChange={set('name')} placeholder="Ao A05" /></Field>
      <Field label="Số cá thả (con)" error={errors.fish}><input type="number" min={1} value={values.fish} onChange={set('fish')} placeholder="10000" /></Field>
      <Field label="Diện tích (m²)" error={errors.area}><input type="number" min={1} value={values.area} onChange={set('area')} placeholder="2000" /></Field>
      <Field label="Ngày thả giống" error={errors.stockedAt}><input type="date" value={values.stockedAt} onChange={set('stockedAt')} /></Field>
    </form>
  </Modal>
}

function PondSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { farmPonds } = useFarm()
  return <select value={value} onChange={(event) => onChange(event.target.value)}>{farmPonds.map((pond) => <option key={pond.id} value={pond.id}>{pond.name}</option>)}</select>
}

function FeedForm({ pondId, onClose }: { pondId?: string; onClose: () => void }) {
  const { farmPonds, addFeed } = useFarm()
  const { notify } = useAppUI()
  const [values, setValues] = useState({ pondId: pondId ?? farmPonds[0]?.id ?? '', kg: '', type: FEED_TYPES[0], time: toLocalInput(Date.now()), note: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    const kg = Number(values.kg)
    const ts = new Date(values.time).getTime()
    if (!values.pondId) next.pondId = 'Chưa có ao nào trong trang trại'
    if (!Number.isFinite(kg) || kg <= 0 || kg > 500) next.kg = 'Lượng thức ăn từ 0.1 đến 500 kg'
    if (!Number.isFinite(ts)) next.time = 'Thời gian không hợp lệ'
    else if (ts > Date.now() + 60_000) next.time = 'Không thể ghi nhận cho thời điểm trong tương lai'
    setErrors(next)
    if (Object.keys(next).length) return
    addFeed({ pondId: values.pondId, kg: Math.round(kg * 10) / 10, type: values.type, ts, note: values.note.trim() })
    notify(`Đã ghi nhận ${kg} kg thức ăn`)
    onClose()
  }

  return <Modal title="Ghi nhận cho ăn" description="Lưu lượng thức ăn đã cho ăn để theo dõi chi phí và FCR." onClose={onClose} footer={<FormFooter onClose={onClose} submitLabel="Lưu ghi nhận" form="feed-form" />}>
    <form id="feed-form" className="form-grid" onSubmit={submit} noValidate>
      <Field label="Ao nuôi" error={errors.pondId}><PondSelect value={values.pondId} onChange={(value) => setValues({ ...values, pondId: value })} /></Field>
      <Field label="Lượng thức ăn (kg)" error={errors.kg}><input type="number" step="0.1" min={0.1} value={values.kg} onChange={(event) => setValues({ ...values, kg: event.target.value })} placeholder="20" /></Field>
      <Field label="Loại thức ăn"><select value={values.type} onChange={(event) => setValues({ ...values, type: event.target.value })}>{FEED_TYPES.map((type) => <option key={type}>{type}</option>)}</select></Field>
      <Field label="Thời gian" error={errors.time}><input type="datetime-local" value={values.time} onChange={(event) => setValues({ ...values, time: event.target.value })} /></Field>
      <Field label="Ghi chú"><textarea rows={2} value={values.note} onChange={(event) => setValues({ ...values, note: event.target.value })} placeholder="Cá ăn mạnh, hết thức ăn sau 15 phút…" /></Field>
    </form>
  </Modal>
}

function HealthForm({ pondId, onClose }: { pondId?: string; onClose: () => void }) {
  const { farmPonds, addHealth } = useFarm()
  const { notify } = useAppUI()
  const [values, setValues] = useState({ pondId: pondId ?? farmPonds[0]?.id ?? '', dead: '0', weight: '', condition: 'good' as HealthCondition, note: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pond = farmPonds.find((item) => item.id === values.pondId)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    const dead = Number(values.dead)
    const weight = Number(values.weight)
    if (!pond) next.pondId = 'Chưa có ao nào trong trang trại'
    if (!Number.isInteger(dead) || dead < 0) next.dead = 'Số cá chết phải là số nguyên ≥ 0'
    else if (pond && dead > pond.fish) next.dead = `Không thể lớn hơn số cá hiện có (${pond.fish.toLocaleString('en-US')})`
    if (!Number.isFinite(weight) || weight <= 0 || weight > 5000) next.weight = 'Trọng lượng từ 1 đến 5000 g'
    setErrors(next)
    if (Object.keys(next).length) return
    addHealth({ pondId: values.pondId, dead, weight: Math.round(weight), condition: values.condition, ts: Date.now(), note: values.note.trim() })
    notify('Đã lưu kết quả kiểm tra sức khỏe')
    onClose()
  }

  return <Modal title="Ghi nhận sức khỏe cá" description="Số cá chết sẽ được trừ vào số lượng cá của ao." onClose={onClose} footer={<FormFooter onClose={onClose} submitLabel="Lưu kết quả" form="health-form" />}>
    <form id="health-form" className="form-grid" onSubmit={submit} noValidate>
      <Field label="Ao nuôi" error={errors.pondId} hint={pond ? `Hiện có ${pond.fish.toLocaleString('en-US')} con` : undefined}><PondSelect value={values.pondId} onChange={(value) => setValues({ ...values, pondId: value })} /></Field>
      <Field label="Tình trạng"><select value={values.condition} onChange={(event) => setValues({ ...values, condition: event.target.value as HealthCondition })}>{Object.entries(CONDITION_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label="Cá chết (con)" error={errors.dead}><input type="number" min={0} value={values.dead} onChange={(event) => setValues({ ...values, dead: event.target.value })} /></Field>
      <Field label="Trọng lượng TB (g/con)" error={errors.weight}><input type="number" min={1} value={values.weight} onChange={(event) => setValues({ ...values, weight: event.target.value })} placeholder="350" /></Field>
      <Field label="Ghi chú"><textarea rows={2} value={values.note} onChange={(event) => setValues({ ...values, note: event.target.value })} placeholder="Biểu hiện bất thường, thuốc đã dùng…" /></Field>
    </form>
  </Modal>
}

export function FormHost({ form, onClose }: { form: FormRequest; onClose: () => void }) {
  if (form.kind === 'pond') return <PondForm pond={form.pond} onClose={onClose} />
  if (form.kind === 'feed') return <FeedForm pondId={form.pondId} onClose={onClose} />
  return <HealthForm pondId={form.pondId} onClose={onClose} />
}
