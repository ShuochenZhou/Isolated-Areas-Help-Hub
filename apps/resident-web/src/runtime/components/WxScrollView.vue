<script setup lang="ts">
// <scroll-view>: the same two-layer structure as WeChat (the inner box scrolls and inherits the
// outer max-height). On a desktop, a horizontal scroll-view also follows the mouse wheel and
// can be dragged, since a mouse has no horizontal swipe.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { ComponentEvent } from '../types'

const props = defineProps({
  scrollX: { type: Boolean, default: false },
  scrollY: { type: Boolean, default: false },
  scrollTop: { type: [Number, String], default: undefined },
  scrollLeft: { type: [Number, String], default: undefined },
  scrollIntoView: { type: String, default: '' },
  scrollWithAnimation: { type: Boolean, default: false },
  upperThreshold: { type: [Number, String], default: 50 },
  lowerThreshold: { type: [Number, String], default: 50 },
  showScrollbar: { type: Boolean, default: true },
  enhanced: { type: Boolean, default: false }
})
const emit = defineEmits<{ scroll: [event: ComponentEvent]; scrolltolower: [event: ComponentEvent]; scrolltoupper: [event: ComponentEvent] }>()

const box = ref<HTMLElement | null>(null)
const style = computed(() => ({ overflowX: props.scrollX ? 'auto' as const : 'hidden' as const, overflowY: props.scrollY ? 'auto' as const : 'hidden' as const }))
const behavior = () => (props.scrollWithAnimation ? 'smooth' : 'auto') as ScrollBehavior

let last = { top: 0, left: 0 }
let atLower = false
let atUpper = true

// A scroll event can still arrive after the scroll-view has been removed (a sheet closed by the
// tap that ended a fling), so every handler checks that the element is still there.
function onScroll(event: Event) {
  const element = box.value
  if (!element) return
  const detail = {
    scrollLeft: element.scrollLeft, scrollTop: element.scrollTop, scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth, deltaX: element.scrollLeft - last.left, deltaY: element.scrollTop - last.top
  }
  last = { top: element.scrollTop, left: element.scrollLeft }
  emit('scroll', { type: 'scroll', detail, native: event })
  const vertical = props.scrollY
  const remaining = vertical ? element.scrollHeight - element.clientHeight - element.scrollTop : element.scrollWidth - element.clientWidth - element.scrollLeft
  const position = vertical ? element.scrollTop : element.scrollLeft
  const lower = remaining <= Number(props.lowerThreshold)
  const upper = position <= Number(props.upperThreshold)
  if (lower && !atLower) emit('scrolltolower', { type: 'scrolltolower', detail: { direction: vertical ? 'bottom' : 'right' } })
  if (upper && !atUpper) emit('scrolltoupper', { type: 'scrolltoupper', detail: { direction: vertical ? 'top' : 'left' } })
  atLower = lower
  atUpper = upper
}

function intoView(id: string) {
  const element = box.value
  if (!element || !id) return
  const target = element.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null
  if (!target) return
  const outer = element.getBoundingClientRect()
  const inner = target.getBoundingClientRect()
  element.scrollTo({
    top: props.scrollY ? element.scrollTop + inner.top - outer.top : undefined,
    left: props.scrollX ? element.scrollLeft + inner.left - outer.left : undefined,
    behavior: behavior()
  })
}

watch(() => props.scrollIntoView, id => nextTick(() => intoView(id)))
watch(() => props.scrollTop, top => { if (top !== undefined && box.value) box.value.scrollTo({ top: Number(top), behavior: behavior() }) })
watch(() => props.scrollLeft, left => { if (left !== undefined && box.value) box.value.scrollTo({ left: Number(left), behavior: behavior() }) })
onMounted(() => {
  const element = box.value!
  if (props.scrollTop !== undefined) element.scrollTop = Number(props.scrollTop)
  if (props.scrollLeft !== undefined) element.scrollLeft = Number(props.scrollLeft)
  if (props.scrollIntoView) intoView(props.scrollIntoView)
})

// Desktop: vertical wheel and mouse drag move a horizontal list.
function onWheel(event: WheelEvent) {
  const element = box.value
  if (!element) return
  if (!props.scrollX || props.scrollY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
  const max = element.scrollWidth - element.clientWidth
  if (max <= 0) return
  const next = Math.min(max, Math.max(0, element.scrollLeft + event.deltaY))
  if (next === element.scrollLeft) return
  event.preventDefault()
  element.scrollLeft = next
}

let drag: { x: number; y: number; left: number; top: number; moved: boolean } | null = null
function onPointerDown(event: PointerEvent) {
  const element = box.value
  if (event.pointerType !== 'mouse' || event.button !== 0 || !element) return
  drag = { x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop, moved: false }
}
function onPointerMove(event: PointerEvent) {
  const element = box.value
  if (!drag || !element) return
  const dx = event.clientX - drag.x
  const dy = event.clientY - drag.y
  if (!drag.moved && Math.hypot(dx, dy) < 6) return
  drag.moved = true
  if (props.scrollX) element.scrollLeft = drag.left - dx
  if (props.scrollY) element.scrollTop = drag.top - dy
}
function onPointerUp() {
  if (drag?.moved) {
    // The click that ends a drag is not a tap on a card.
    const swallow = (click: Event) => { click.stopPropagation(); click.preventDefault() }
    box.value?.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => box.value?.removeEventListener('click', swallow, { capture: true }), 0)
  }
  drag = null
}
</script>

<template>
  <wx-scroll-view>
    <div
      ref="box"
      class="wx-scroll-view"
      :class="{ 'wx-scroll-view-x': scrollX && !scrollY, 'wx-scroll-view-hide-scrollbar': !showScrollbar }"
      :style="style"
      @scroll.passive="onScroll"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerUp"
    ><slot /></div>
  </wx-scroll-view>
</template>
