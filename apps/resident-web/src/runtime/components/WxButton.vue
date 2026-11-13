<script setup lang="ts">
// <button>: WeChat reflects only the attributes the page sets (type, size, plain, disabled,
// loading), and its built-in styles key off them, so they are reflected the same way here.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { current } from '../router'
import { callPage } from '../page'
import type { ComponentEvent } from '../types'
import { attachHover } from './hover'

const props = defineProps({
  size: { type: String, default: undefined },
  type: { type: String, default: undefined },
  plain: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  formType: { type: String, default: undefined },
  openType: { type: String, default: undefined },
  hoverClass: { type: String, default: 'button-hover' },
  hoverStartTime: { type: Number, default: 20 },
  hoverStayTime: { type: Number, default: 70 },
  hoverStopPropagation: { type: Boolean, default: false }
})
const emit = defineEmits<{ tap: [event: ComponentEvent] }>()
// Only what the page set is reflected; WeChat's styles key off these attributes.
const reflected = computed<Record<string, string | number | undefined>>(() => ({
  type: props.type,
  size: props.size,
  plain: props.plain ? '' : undefined,
  disabled: props.disabled ? '' : undefined,
  loading: props.loading ? 'true' : undefined,
  tabindex: props.disabled ? -1 : 0,
  'aria-disabled': props.disabled ? 'true' : undefined
}))
const root = ref<HTMLElement | null>(null)
let detach: (() => void) | undefined

onMounted(() => {
  detach = attachHover(root.value!, () => ({
    cls: props.hoverClass, start: props.hoverStartTime, stay: props.hoverStayTime,
    stop: props.hoverStopPropagation, disabled: props.disabled
  }))
})
onBeforeUnmount(() => detach?.())

function onClick(event: MouseEvent) {
  if (props.disabled) return
  emit('tap', { type: 'tap', detail: { x: event.pageX, y: event.pageY }, native: event })
  if (props.openType === 'share') {
    const page = current()
    if (page) callPage(page, 'onShareAppMessage', { from: 'button', target: {} })
  }
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    ;(event.currentTarget as HTMLElement).click()
  }
}
</script>

<template>
  <wx-button
    ref="root"
    role="button"
    v-bind="reflected"
    @click="onClick"
    @keydown="onKey"
  ><slot /></wx-button>
</template>
