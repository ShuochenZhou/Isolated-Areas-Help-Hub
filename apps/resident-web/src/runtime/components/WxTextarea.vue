<script setup lang="ts">
// <textarea>: WeChat's default box is 300 × 150 px, the text area fills its content box.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { ComponentEvent } from '../types'

const props = defineProps({
  value: { type: [String, Number], default: '' },
  placeholder: { type: String, default: '' },
  placeholderClass: { type: String, default: 'textarea-placeholder' },
  disabled: { type: Boolean, default: false },
  maxlength: { type: [Number, String], default: 140 },
  focus: { type: Boolean, default: false },
  autoFocus: { type: Boolean, default: false },
  autoHeight: { type: Boolean, default: false },
  confirmType: { type: String, default: 'return' }
})
const emit = defineEmits<{
  input: [event: ComponentEvent]; focus: [event: ComponentEvent]; blur: [event: ComponentEvent]
  confirm: [event: ComponentEvent]; linechange: [event: ComponentEvent]
}>()

const field = ref<HTMLTextAreaElement | null>(null)
const height = ref<number | null>(null)
let composing = false
let lines = 1

const limit = computed(() => {
  const value = Number(props.maxlength)
  return Number.isFinite(value) && value >= 0 ? value : undefined
})
const disabledAttr = computed<Record<string, string | undefined>>(() => ({ disabled: props.disabled ? '' : undefined }))
const text = (value: unknown) => (value === undefined || value === null ? '' : String(value))

function measure() {
  const element = field.value
  if (!element) return
  if (props.autoHeight) {
    element.style.height = '0px'
    height.value = element.scrollHeight
    element.style.height = ''
  }
  const lineHeight = parseFloat(getComputedStyle(element).lineHeight) || 18
  const count = Math.max(1, Math.round(element.scrollHeight / lineHeight))
  if (count !== lines) {
    lines = count
    emit('linechange', { type: 'linechange', detail: { height: element.scrollHeight, heightRpx: 0, lineCount: count } })
  }
}

function sync(value: unknown) {
  const element = field.value
  if (!element || composing) return
  const next = text(value)
  if (element.value !== next) element.value = next
  nextTick(measure)
}

watch(() => props.value, sync)
watch(() => props.focus, focus => { if (focus) nextTick(() => field.value?.focus()) })
onMounted(() => {
  sync(props.value)
  if (props.focus || props.autoFocus) field.value?.focus()
})

function onInput() {
  if (!composing) report()
}
function onCompositionStart() {
  composing = true
}
function onCompositionEnd() {
  composing = false
  report()
}

function report() {
  const element = field.value!
  let value = element.value
  if (limit.value !== undefined && value.length > limit.value) element.value = value = value.slice(0, limit.value)
  emit('input', {
    type: 'input',
    detail: { value, cursor: element.selectionStart ?? value.length, keyCode: 0 },
    respond: result => { if (typeof result === 'string') element.value = result }
  })
  measure()
}
</script>

<template>
  <wx-textarea v-bind="disabledAttr" :style="autoHeight && height !== null ? { height: height + 'px' } : undefined">
    <div class="wx-textarea-box">
      <textarea
        ref="field"
        class="wx-textarea-field"
        :class="placeholderClass"
        :placeholder="placeholder"
        :disabled="disabled"
        :maxlength="limit"
        spellcheck="false"
        @input="onInput"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
        @focus="emit('focus', { type: 'focus', detail: { value: field?.value ?? '', height: 0 }, native: $event })"
        @blur="emit('blur', { type: 'blur', detail: { value: field?.value ?? '' }, native: $event })"
      />
    </div>
  </wx-textarea>
</template>
