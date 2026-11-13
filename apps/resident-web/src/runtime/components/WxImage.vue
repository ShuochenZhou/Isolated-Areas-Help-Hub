<script setup lang="ts">
// <image>: package paths ("/images/x.png") resolve to the bundled files; the modes map to CSS.
import { computed, ref } from 'vue'
import { assets } from 'virtual:miniapp'
import type { ComponentEvent } from '../types'

const props = defineProps({
  src: { type: String, default: '' },
  mode: { type: String, default: 'scaleToFill' },
  lazyLoad: { type: Boolean, default: false }
})
const emit = defineEmits<{ load: [event: ComponentEvent]; error: [event: ComponentEvent] }>()
const size = ref<{ width: number; height: number } | null>(null)

const url = computed(() => assets[props.src] || assets[`/${props.src.replace(/^\.?\//, '')}`] || props.src)
const fit = computed(() => ({ aspectFit: 'contain', aspectFill: 'cover', scaleToFill: 'fill', widthFix: 'fill', heightFix: 'fill' } as Record<string, string>)[props.mode] || 'none')
const style = computed(() => {
  if (props.mode === 'widthFix' && size.value) return { height: 'auto' }
  if (props.mode === 'heightFix' && size.value) return { width: 'auto' }
  return undefined
})

function loaded(event: Event) {
  const image = event.target as HTMLImageElement
  size.value = { width: image.naturalWidth, height: image.naturalHeight }
  emit('load', { type: 'load', detail: { width: image.naturalWidth, height: image.naturalHeight }, native: event })
}
</script>

<template>
  <wx-image :style="style">
    <img
      v-if="url"
      :src="url"
      :loading="lazyLoad ? 'lazy' : undefined"
      :style="{ objectFit: fit as any, width: '100%', height: mode === 'widthFix' ? 'auto' : '100%' }"
      draggable="false"
      alt=""
      @load="loaded"
      @error="emit('error', { type: 'error', detail: { errMsg: 'image load failed' }, native: $event })"
    >
  </wx-image>
</template>
