<script setup lang="ts">
// <icon>: WeChat's built-in status icons, drawn as SVG.
import { computed } from 'vue'

const props = defineProps({
  type: { type: String, default: 'success' },
  size: { type: [Number, String], default: 23 },
  color: { type: String, default: '' }
})
const COLORS: Record<string, string> = {
  success: '#07c160', success_no_circle: '#07c160', info: '#10aeff', warn: '#fa5151', waiting: '#10aeff',
  cancel: '#fa5151', download: '#07c160', search: '#b2b2b2', clear: '#b2b2b2'
}
const fill = computed(() => props.color || COLORS[props.type] || '#07c160')
const px = computed(() => (typeof props.size === 'number' || /^\d+$/.test(String(props.size)) ? `${props.size}px` : String(props.size)))
</script>

<template>
  <wx-icon :style="{ width: px, height: px }">
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <template v-if="type === 'success'"><circle cx="12" cy="12" r="11" :fill="fill" /><path d="M7 12.5l3.2 3.2L17.5 8.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></template>
      <path v-else-if="type === 'success_no_circle'" d="M4 12.5l5 5L20 6.5" fill="none" :stroke="fill" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      <template v-else-if="type === 'info' || type === 'warn'"><circle cx="12" cy="12" r="11" :fill="fill" /><path :d="type === 'info' ? 'M12 10.5v7M12 7v.5' : 'M12 6.5v7.5M12 17v.5'" stroke="#fff" stroke-width="2.2" stroke-linecap="round" /></template>
      <template v-else-if="type === 'waiting'"><circle cx="12" cy="12" r="11" :fill="fill" /><path d="M12 6.5V12l3.5 2.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" /></template>
      <template v-else-if="type === 'cancel' || type === 'clear'"><circle cx="12" cy="12" r="11" :fill="fill" /><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#fff" stroke-width="2" stroke-linecap="round" /></template>
      <template v-else-if="type === 'download'"><circle cx="12" cy="12" r="11" :fill="fill" /><path d="M12 6.5v8M8.5 11.5l3.5 3.5 3.5-3.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></template>
      <template v-else-if="type === 'search'"><circle cx="10.5" cy="10.5" r="6.5" fill="none" :stroke="fill" stroke-width="2" /><path d="M15.5 15.5L20 20" :stroke="fill" stroke-width="2" stroke-linecap="round" /></template>
    </svg>
  </wx-icon>
</template>
