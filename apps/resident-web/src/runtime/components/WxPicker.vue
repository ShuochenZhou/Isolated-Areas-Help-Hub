<script setup lang="ts">
// <picker>: tapping its content opens WeChat's bottom sheet of wheels (Overlays.vue).
// Modes: selector (default), multiSelector, time and date, with WeChat's change values.
import { computed } from 'vue'
import { openPicker } from '../ui'
import type { ComponentEvent } from '../types'

const props = defineProps({
  mode: { type: String, default: 'selector' },
  range: { type: Array, default: () => [] },
  rangeKey: { type: String, default: '' },
  value: { type: [Number, String, Array], default: undefined },
  start: { type: String, default: '' },
  end: { type: String, default: '' },
  fields: { type: String, default: 'day' },
  disabled: { type: Boolean, default: false },
  headerText: { type: String, default: '' }
})
const emit = defineEmits<{ change: [event: ComponentEvent]; cancel: [event: ComponentEvent]; columnchange: [event: ComponentEvent] }>()

const disabledAttr = computed<Record<string, string | undefined>>(() => ({ disabled: props.disabled ? '' : undefined }))
const pad = (value: number) => String(value).padStart(2, '0')
const label = (item: unknown) => String(props.rangeKey && item && typeof item === 'object' ? (item as Record<string, unknown>)[props.rangeKey] ?? '' : item ?? '')

async function openSelector() {
  const columns = [props.range.map(label)]
  const result = await openPicker(columns, [Number(props.value) || 0])
  if (!result) return emit('cancel', { type: 'cancel', detail: {} })
  emit('change', { type: 'change', detail: { value: result[0] } })
}

async function openMulti() {
  const ranges = props.range as unknown[][]
  const columns = ranges.map(column => (column || []).map(label))
  const value = Array.isArray(props.value) ? (props.value as unknown[]).map(Number) : columns.map(() => 0)
  const result = await openPicker(columns, value, (column, index) => {
    emit('columnchange', { type: 'columnchange', detail: { column, value: index } })
  })
  if (!result) return emit('cancel', { type: 'cancel', detail: {} })
  emit('change', { type: 'change', detail: { value: result } })
}

async function openTime() {
  const [startHour, startMinute] = (props.start || '00:00').split(':').map(Number)
  const [endHour, endMinute] = (props.end || '23:59').split(':').map(Number)
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i)
  const minutes = Array.from({ length: 60 }, (_, i) => i)
  const [hour, minute] = String(props.value || `${pad(startHour)}:${pad(startMinute)}`).split(':').map(Number)
  const result = await openPicker([hours.map(pad), minutes.map(pad)], [Math.max(0, hours.indexOf(hour)), Math.max(0, minute)])
  if (!result) return emit('cancel', { type: 'cancel', detail: {} })
  const h = hours[result[0]]
  let m = minutes[result[1]]
  if (h === startHour && m < startMinute) m = startMinute
  if (h === endHour && m > endMinute) m = endMinute
  emit('change', { type: 'change', detail: { value: `${pad(h)}:${pad(m)}` } })
}

async function openDate() {
  const today = new Date()
  const parse = (text: string, fallback: [number, number, number]) => {
    const parts = text.split('-').map(Number)
    return [parts[0] || fallback[0], parts[1] || fallback[1], parts[2] || fallback[2]] as [number, number, number]
  }
  const [startYear] = parse(props.start, [1900, 1, 1])
  const [endYear] = parse(props.end, [2100, 12, 31])
  const current = parse(String(props.value || ''), [today.getFullYear(), today.getMonth() + 1, today.getDate()])
  const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i)
  const daysIn = (year: number, month: number) => new Date(year, month, 0).getDate()
  const build = (value: number[]) => {
    const columns = [years.map(String), Array.from({ length: 12 }, (_, i) => pad(i + 1))]
    if (props.fields === 'day') columns.push(Array.from({ length: daysIn(years[value[0]], value[1] + 1) }, (_, i) => pad(i + 1)))
    return props.fields === 'year' ? columns.slice(0, 1) : columns
  }
  const value = [Math.max(0, years.indexOf(current[0])), current[1] - 1, current[2] - 1]
  const result = await openPicker(build(value), value, (_column, _index, now) => build(now))
  if (!result) return emit('cancel', { type: 'cancel', detail: {} })
  const year = years[result[0]]
  const text = props.fields === 'year' ? `${year}` : props.fields === 'month' ? `${year}-${pad(result[1] + 1)}` : `${year}-${pad(result[1] + 1)}-${pad(result[2] + 1)}`
  emit('change', { type: 'change', detail: { value: text } })
}

function open() {
  if (props.disabled) return
  if (props.mode === 'multiSelector') void openMulti()
  else if (props.mode === 'time') void openTime()
  else if (props.mode === 'date') void openDate()
  else void openSelector()
}
</script>

<template>
  <wx-picker v-bind="disabledAttr" @click="open"><slot /></wx-picker>
</template>
