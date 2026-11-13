<script setup lang="ts">
// WeChat's picker sheet: Cancel / Confirm and one wheel per column, snapping row by row.
import { nextTick, onMounted, ref } from 'vue'
import { systemText } from '../system-text'
import type { PickerState } from '../ui'

const props = defineProps<{ state: PickerState }>()
const ROW = 34
const columns = ref<string[][]>(props.state.columns.map(column => column.slice()))
const value = ref<number[]>(props.state.value.slice())
const wheels = ref<HTMLElement[]>([])
const closing = ref(false)
const timers: ReturnType<typeof setTimeout>[] = []

onMounted(async () => {
  await nextTick()
  wheels.value.forEach((wheel, index) => { wheel.scrollTop = (value.value[index] || 0) * ROW })
})

function settle(column: number) {
  const wheel = wheels.value[column]
  if (!wheel) return
  clearTimeout(timers[column])
  timers[column] = setTimeout(() => {
    const index = Math.min(Math.max(0, Math.round(wheel.scrollTop / ROW)), Math.max(0, columns.value[column].length - 1))
    if (index === value.value[column]) return
    value.value[column] = index
    const rebuilt = props.state.onColumnChange?.(column, index, value.value.slice())
    if (rebuilt) {
      columns.value = rebuilt.map(item => item.slice())
      value.value = value.value.map((selected, i) => Math.min(selected, Math.max(0, (columns.value[i] || []).length - 1)))
    }
  }, 90)
}

function pick(column: number, index: number) {
  wheels.value[column]?.scrollTo({ top: index * ROW, behavior: 'smooth' })
}

function finish(result: number[] | null) {
  if (closing.value) return
  closing.value = true
  setTimeout(() => props.state.resolve(result), 180)
}
</script>

<template>
  <div class="wx-sheet-mask" :class="{ 'wx-closing': closing }" @click.self="finish(null)">
    <div class="wx-picker-sheet" role="dialog" aria-modal="true">
      <div class="wx-picker-head">
        <button type="button" class="wx-picker-cancel" @click="finish(null)">{{ systemText('cancel') }}</button>
        <button type="button" class="wx-picker-confirm" @click="finish(value.slice())">{{ systemText('ok') }}</button>
      </div>
      <div class="wx-picker-body">
        <div
          v-for="(column, columnIndex) in columns"
          :key="columnIndex"
          :ref="element => { if (element) wheels[columnIndex] = element as HTMLElement }"
          class="wx-picker-wheel"
          @scroll.passive="settle(columnIndex)"
        >
          <div
            v-for="(item, index) in column"
            :key="index"
            class="wx-picker-row"
            :class="{ 'wx-picker-row-selected': index === value[columnIndex] }"
            @click="pick(columnIndex, index)"
          >{{ item }}</div>
        </div>
        <div class="wx-picker-indicator" />
        <div class="wx-picker-fade" />
      </div>
    </div>
  </div>
</template>
