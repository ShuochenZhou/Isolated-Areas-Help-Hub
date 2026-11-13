<script setup lang="ts">
// The WeChat application's window: every live page stacked (the top one visible), plus WeChat's
// overlays. Keeps --rpx (1/750 of the width) and --wx-vw current, as WeChat does for rpx.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { current, state } from '../router'
import Overlays from './Overlays.vue'
import PageView from './PageView.vue'

const root = ref<HTMLElement | null>(null)
const width = ref(375)
const top = computed(() => current())
// The smallest non-zero rpx value WeChat draws: half a pixel on iOS retina screens, else one pixel.
const ios = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)
const rpxMin = ios && (window.devicePixelRatio || 1) !== 1 ? '0.5px' : '1px'
let resizer: ResizeObserver | undefined

onMounted(() => {
  resizer = new ResizeObserver(() => { width.value = root.value?.clientWidth || 375 })
  resizer.observe(root.value!)
  width.value = root.value!.clientWidth || 375
})
onBeforeUnmount(() => resizer?.disconnect())

// Pages under the top one stay mounted (WeChat keeps them alive) but out of view; a page that is
// being navigated away from stays above the one it reveals until its slide-out ends.
function layer(record: (typeof state.alive)[number]) {
  if (record.leaving) return 40
  if (record === top.value) return 30
  const position = state.stack.indexOf(record)
  return position >= 0 ? 10 + position : 1
}
</script>

<template>
  <div id="wx-app" ref="root" class="wx-app" :style="{ '--rpx': width / 750 + 'px', '--wx-vw': width / 100 + 'px', '--wx-rpx-min': rpxMin }">
    <PageView
      v-for="record in state.alive"
      :key="record.id"
      :record="record"
      :active="record === top"
      :style="{ zIndex: layer(record) }"
    />
    <Overlays />
  </div>
</template>
