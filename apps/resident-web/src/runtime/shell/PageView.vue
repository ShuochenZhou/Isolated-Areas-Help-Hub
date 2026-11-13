<script setup lang="ts">
// One page window: navigation bar, the page's own scrolling viewport (the containing block for
// its position:fixed elements, sized for 100vh), pull-down refresh, and the tab bar on tab pages.
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { callPage, type PageAnimation, type PageRecord } from '../page'
import { markReady, tabBar } from '../router'
import NavBar from './NavBar.vue'
import PageContent from './PageContent'
import TabBar from './TabBar.vue'

const props = defineProps<{ record: PageRecord; active: boolean }>()
provide('wx-page-record', props.record)

const frame = ref<HTMLElement | null>(null)
const viewport = ref<HTMLElement | null>(null)
const scroller = ref<HTMLElement | null>(null)
const pull = ref(0)
const dragging = ref(false)
const vh = ref(0)

const config = props.record.config
const showTabBar = computed(() => props.record.isTab && !tabBar.hidden)
const custom = config.navigationStyle === 'custom'
const REFRESH_HEIGHT = 56

// ---- animations (navigateTo / navigateBack) ---------------------------------------------------

const FRAMES: Record<PageAnimation, Keyframe[]> = {
  enter: [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }],
  leave: [{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }],
  cover: [{ transform: 'translateX(0)', filter: 'brightness(1)' }, { transform: 'translateX(-28%)', filter: 'brightness(.92)' }],
  uncover: [{ transform: 'translateX(-28%)', filter: 'brightness(.92)' }, { transform: 'translateX(0)', filter: 'brightness(1)' }]
}

// A page pushed aside by navigateTo keeps that look until it is shown again — by navigateBack
// (which slides it back) or by switchTab/reLaunch (which just show it).
let covered: Animation | null = null
function uncover() {
  covered?.cancel()
  covered = null
}
watch(() => props.active, active => { if (active) uncover() })

props.record.animate = kind => new Promise<void>(resolve => {
  const element = frame.value
  if (kind === 'uncover') uncover()
  if (!element || document.visibilityState === 'hidden' || matchMedia('(prefers-reduced-motion: reduce)').matches) return resolve()
  element.classList.add('wx-frame-animating')
  const animation = element.animate(FRAMES[kind], { duration: 300, easing: 'cubic-bezier(.32,.72,0,1)', fill: kind === 'cover' || kind === 'leave' ? 'forwards' : 'none' })
  if (kind === 'cover') covered = animation
  let finished = false
  const done = () => {
    if (finished) return
    finished = true
    element.classList.remove('wx-frame-animating')
    if (kind === 'uncover' || kind === 'enter') element.getAnimations().forEach(item => item.cancel())
    resolve()
  }
  animation.finished.then(done, done)
  setTimeout(done, 450)
})

// ---- pull-down refresh ------------------------------------------------------------------------

function startRefresh() {
  if (props.record.refreshing.value) return
  props.record.refreshing.value = true
  pull.value = REFRESH_HEIGHT
  callPage(props.record, 'onPullDownRefresh')
}

watch(() => props.record.refreshing.value, refreshing => {
  if (refreshing) pull.value = REFRESH_HEIGHT
  else if (!dragging.value) pull.value = 0
})

let pullStartY: number | null = null
function canPull(target: EventTarget | null) {
  if (!config.enablePullDownRefresh || props.record.refreshing.value || (scroller.value?.scrollTop ?? 1) > 0) return false
  return !(target instanceof Element && target.closest('input, textarea, wx-map, wx-scroll-view, .leaflet-container'))
}
function pullTo(y: number): boolean {
  if (pullStartY === null) return false
  const distance = y - pullStartY
  if (distance <= 0 || (scroller.value?.scrollTop ?? 0) > 0) {
    if (dragging.value) { dragging.value = false; pull.value = 0 }
    return false
  }
  if (!dragging.value && distance < 6) return false
  dragging.value = true
  pull.value = Math.min(110, distance * 0.5)
  return true
}
function release() {
  pullStartY = null
  if (!dragging.value) return
  dragging.value = false
  if (pull.value >= REFRESH_HEIGHT) startRefresh()
  else pull.value = 0
}
// Touch: the pull takes over from the browser's own scrolling/bounce at the top of the page.
function onTouchStart(event: TouchEvent) {
  pullStartY = event.touches.length === 1 && canPull(event.target) ? event.touches[0].clientY : null
}
function onTouchMove(event: TouchEvent) {
  if (pullTo(event.touches[0]?.clientY ?? 0) && event.cancelable) event.preventDefault()
}
// Mouse: drag the page down.
function onPointerDown(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || event.button !== 0) return
  pullStartY = canPull(event.target) ? event.clientY : null
}
function onPointerMove(event: PointerEvent) {
  if (event.pointerType === 'mouse') pullTo(event.clientY)
}
function onPointerUp(event: PointerEvent) {
  if (event.pointerType === 'mouse') release()
}

// A trackpad or wheel pushing past the top also refreshes, since a mouse cannot pull.
let wheelPush = 0
let wheelTimer: ReturnType<typeof setTimeout> | undefined
function onWheel(event: WheelEvent) {
  if (!canPull(event.target) || event.deltaY >= 0) { wheelPush = 0; return }
  wheelPush += -event.deltaY
  clearTimeout(wheelTimer)
  wheelTimer = setTimeout(() => { wheelPush = 0; if (!props.record.refreshing.value) pull.value = 0 }, 260)
  pull.value = Math.min(REFRESH_HEIGHT, wheelPush * 0.25)
  if (wheelPush > 240) { wheelPush = 0; startRefresh() }
}

// ---- page scroll hooks --------------------------------------------------------------------------

let reachedBottom = false
function onScroll() {
  const element = scroller.value!
  if (typeof props.record.instance.onPageScroll === 'function') callPage(props.record, 'onPageScroll', { scrollTop: element.scrollTop })
  const near = element.scrollHeight - element.clientHeight - element.scrollTop <= config.onReachBottomDistance
  if (near && !reachedBottom && element.scrollHeight > element.clientHeight) callPage(props.record, 'onReachBottom')
  reachedBottom = near
}

// ---- sizing ----------------------------------------------------------------------------------

let resizer: ResizeObserver | undefined
onMounted(() => {
  props.record.scroller.value = scroller.value
  resizer = new ResizeObserver(() => {
    vh.value = (viewport.value?.clientHeight || 0) / 100
    if (props.record.ready) callPage(props.record, 'onResize', { size: { windowWidth: viewport.value?.clientWidth, windowHeight: viewport.value?.clientHeight } })
  })
  resizer.observe(viewport.value!)
  vh.value = viewport.value!.clientHeight / 100
  void nextTick(() => markReady(props.record))
})
onBeforeUnmount(() => {
  resizer?.disconnect()
  clearTimeout(wheelTimer)
  if (props.record.scroller.value === scroller.value) props.record.scroller.value = null
})
</script>

<template>
  <section
    ref="frame"
    class="wx-frame"
    :class="{ 'wx-frame-active': active }"
    :aria-hidden="active ? undefined : 'true'"
    :style="{ '--wx-window-bg': config.backgroundColor }"
  >
    <NavBar v-if="!custom" :record="record" />
    <div
      ref="viewport"
      class="wx-viewport"
      :class="{ 'wx-viewport-custom': custom, 'wx-viewport-tab': showTabBar }"
      :style="{ '--wx-vh': vh + 'px' }"
    >
      <div v-if="config.enablePullDownRefresh" class="wx-refresh" :class="{ 'wx-refresh-light': config.backgroundTextStyle === 'light' }" :style="{ height: pull + 'px' }">
        <span class="wx-refresh-dots" :class="{ 'wx-refresh-running': record.refreshing.value }"><i /><i /><i /></span>
      </div>
      <div
        ref="scroller"
        class="wx-scroller"
        :class="{ 'wx-scroller-locked': config.disableScroll, 'wx-scroller-settling': !dragging }"
        :style="pull ? { transform: `translateY(${pull}px)` } : undefined"
        @scroll.passive="onScroll"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @touchstart.passive="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="release"
        @touchcancel="release"
        @wheel.passive="onWheel"
      >
        <PageContent :record="record" />
      </div>
    </div>
    <TabBar v-if="showTabBar" :route="record.route" />
  </section>
</template>
