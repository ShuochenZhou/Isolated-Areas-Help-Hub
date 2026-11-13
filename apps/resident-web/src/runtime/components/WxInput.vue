<script setup lang="ts">
// <input>: a native input inside <wx-input>. The value follows the page's data like in WeChat;
// type="number"/"digit"/"idcard" only let through what WeChat's keyboards can type, and a
// Chinese IME composition is reported once it is committed.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { ComponentEvent } from '../types'

const props = defineProps({
  value: { type: [String, Number], default: '' },
  type: { type: String, default: 'text' },
  password: { type: Boolean, default: false },
  placeholder: { type: String, default: '' },
  placeholderClass: { type: String, default: 'input-placeholder' },
  disabled: { type: Boolean, default: false },
  maxlength: { type: [Number, String], default: 140 },
  focus: { type: Boolean, default: false },
  autoFocus: { type: Boolean, default: false },
  confirmType: { type: String, default: 'done' },
  confirmHold: { type: Boolean, default: false }
})
const emit = defineEmits<{
  input: [event: ComponentEvent]; focus: [event: ComponentEvent]; blur: [event: ComponentEvent]; confirm: [event: ComponentEvent]
}>()

const field = ref<HTMLInputElement | null>(null)
let composing = false

const limit = computed(() => {
  const value = Number(props.maxlength)
  return Number.isFinite(value) && value >= 0 ? value : undefined
})
const inputMode = computed(() => props.type === 'number' ? 'numeric' : props.type === 'digit' ? 'decimal' : 'text')
type EnterHint = 'send' | 'search' | 'next' | 'go' | 'done'
const enterHint = computed<EnterHint>(() => (['send', 'search', 'next', 'go', 'done'].includes(props.confirmType) ? props.confirmType as EnterHint : 'done'))
const disabledAttr = computed<Record<string, string | undefined>>(() => ({ disabled: props.disabled ? '' : undefined }))

function sanitize(value: string): string {
  let out = value
  if (props.type === 'number') out = out.replace(/\D/g, '')
  else if (props.type === 'digit') out = out.replace(/[^\d.]/g, '')
  else if (props.type === 'idcard') out = out.replace(/[^\dXx]/g, '')
  if (limit.value !== undefined && out.length > limit.value) out = out.slice(0, limit.value)
  return out
}

const text = (value: unknown) => (value === undefined || value === null ? '' : String(value))

function sync(value: unknown) {
  const element = field.value
  if (!element || composing) return
  const next = text(value)
  if (element.value !== next) element.value = next
}

watch(() => props.value, sync)
watch(() => props.focus, focus => { if (focus) nextTick(() => field.value?.focus()) })
onMounted(() => {
  sync(props.value)
  if (props.focus || props.autoFocus) field.value?.focus()
})

function report() {
  const element = field.value!
  const value = sanitize(element.value)
  if (value !== element.value) element.value = value
  emit('input', {
    type: 'input',
    detail: { value, cursor: element.selectionStart ?? value.length, keyCode: 0 },
    respond: result => {
      if (typeof result === 'string' || typeof result === 'number') element.value = String(result)
      else if (result && typeof result === 'object' && 'value' in (result as object)) element.value = text((result as { value: unknown }).value)
    }
  })
}

function onInput(event: Event) {
  if (composing || (event as InputEvent).isComposing) return
  report()
}

function onCompositionStart() {
  composing = true
}

function onCompositionEnd() {
  composing = false
  report()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.isComposing || composing) return
  event.preventDefault()
  emit('confirm', { type: 'confirm', detail: { value: field.value!.value }, native: event })
  if (!props.confirmHold) field.value!.blur()
}
</script>

<template>
  <wx-input v-bind="disabledAttr">
    <input
      ref="field"
      class="wx-input-field"
      :class="placeholderClass"
      :type="password ? 'password' : 'text'"
      :inputmode="inputMode"
      :enterkeyhint="enterHint"
      :placeholder="placeholder"
      :disabled="disabled"
      :maxlength="limit"
      autocomplete="off"
      spellcheck="false"
      @input="onInput"
      @compositionstart="onCompositionStart"
      @compositionend="onCompositionEnd"
      @keydown="onKeydown"
      @focus="emit('focus', { type: 'focus', detail: { value: field?.value ?? '', height: 0 }, native: $event })"
      @blur="emit('blur', { type: 'blur', detail: { value: field?.value ?? '' }, native: $event })"
    >
  </wx-input>
</template>
