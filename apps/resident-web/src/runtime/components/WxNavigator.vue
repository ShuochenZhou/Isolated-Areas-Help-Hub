<script setup lang="ts">
// <navigator>: the declarative form of the routing APIs.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { navigateBack, navigateTo, reLaunch, redirectTo, switchTab } from '../router'
import { attachHover } from './hover'

const props = defineProps({
  url: { type: String, default: '' },
  openType: { type: String, default: 'navigate' },
  delta: { type: [Number, String], default: 1 },
  hoverClass: { type: String, default: 'navigator-hover' },
  hoverStartTime: { type: Number, default: 50 },
  hoverStayTime: { type: Number, default: 600 },
  hoverStopPropagation: { type: Boolean, default: false }
})
const root = ref<HTMLElement | null>(null)
let detach: (() => void) | undefined
onMounted(() => {
  detach = attachHover(root.value!, () => ({ cls: props.hoverClass, start: props.hoverStartTime, stay: props.hoverStayTime, stop: props.hoverStopPropagation }))
})
onBeforeUnmount(() => detach?.())

function go() {
  const url = props.url
  const run = props.openType === 'redirect' ? redirectTo({ url })
    : props.openType === 'switchTab' ? switchTab({ url })
      : props.openType === 'reLaunch' ? reLaunch({ url })
        : props.openType === 'navigateBack' ? navigateBack({ delta: Number(props.delta) })
          : navigateTo({ url })
  run.catch(error => console.warn(error))
}
</script>

<template>
  <wx-navigator ref="root" role="link" tabindex="0" @click="go" @keydown.enter="go"><slot /></wx-navigator>
</template>
