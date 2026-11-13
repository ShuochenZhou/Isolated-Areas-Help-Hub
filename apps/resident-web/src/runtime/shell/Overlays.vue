<script setup lang="ts">
// The UI WeChat draws above a WeChat application: toast/loading, modal, action sheet, picker sheet
// and the location page. All of it sits above the page and its navigation and tab bars.
import { nextTick, ref, watch } from 'vue'
import { systemText } from '../system-text'
import { ui } from '../ui'
import LocationViewer from './LocationViewer.vue'
import PickerSheet from './PickerSheet.vue'

const modalInput = ref<HTMLInputElement | null>(null)
watch(() => ui.modal?.id, async () => {
  if (ui.modal?.editable) { await nextTick(); modalInput.value?.focus() }
})

function confirmModal() {
  const modal = ui.modal
  if (modal) modal.resolve({ confirm: true, cancel: false, ...(modal.editable ? { content: modal.value } : {}) })
}
function cancelModal() {
  const modal = ui.modal
  if (modal) modal.resolve({ confirm: false, cancel: true })
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (ui.modal?.showCancel) cancelModal()
    else if (ui.actionSheet) ui.actionSheet.resolve(-1)
    else if (ui.picker) ui.picker.resolve(null)
    else if (ui.location) ui.location.close()
  }
}
if (typeof window !== 'undefined') window.addEventListener('keydown', onKey)
</script>

<template>
  <div class="wx-overlays">
    <Transition name="wx-fade">
      <div v-if="ui.toast" :key="ui.toast.id" class="wx-toast-layer" :class="{ 'wx-toast-mask': ui.toast.mask || ui.toast.icon === 'loading' }">
        <div class="wx-toast" :class="ui.toast.icon === 'none' && !ui.toast.image ? 'wx-toast-text' : 'wx-toast-icon'" role="status" aria-live="polite">
          <img v-if="ui.toast.image" class="wx-toast-image" :src="ui.toast.image" alt="">
          <svg v-else-if="ui.toast.icon === 'success'" class="wx-toast-symbol" viewBox="0 0 48 48"><path d="M11 25l9 9 17-19" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
          <svg v-else-if="ui.toast.icon === 'error'" class="wx-toast-symbol" viewBox="0 0 48 48"><circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" stroke-width="3" /><path d="M24 15v11M24 31.5v.5" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" /></svg>
          <span v-else-if="ui.toast.icon === 'loading'" class="wx-toast-spinner" />
          <span class="wx-toast-title">{{ ui.toast.title }}</span>
        </div>
      </div>
    </Transition>

    <Transition name="wx-pop">
      <div v-if="ui.modal" :key="ui.modal.id" class="wx-modal-mask">
        <div class="wx-modal" role="alertdialog" aria-modal="true">
          <div class="wx-modal-body">
            <div v-if="ui.modal.title" class="wx-modal-title">{{ ui.modal.title }}</div>
            <input v-if="ui.modal.editable" ref="modalInput" v-model="ui.modal.value" class="wx-modal-input" :placeholder="ui.modal.placeholderText" @keydown.enter="confirmModal">
            <div v-else-if="ui.modal.content" class="wx-modal-content" :class="{ 'wx-modal-content-only': !ui.modal.title }">{{ ui.modal.content }}</div>
          </div>
          <div class="wx-modal-actions">
            <button v-if="ui.modal.showCancel" type="button" class="wx-modal-button" :style="{ color: ui.modal.cancelColor }" @click="cancelModal">{{ ui.modal.cancelText }}</button>
            <button type="button" class="wx-modal-button wx-modal-confirm" :style="{ color: ui.modal.confirmColor }" @click="confirmModal">{{ ui.modal.confirmText }}</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- While a sheet fades out ui.actionSheet is already null, so a late tap on it does nothing. -->
    <Transition name="wx-sheet">
      <div v-if="ui.actionSheet" :key="ui.actionSheet.id" class="wx-sheet-mask" @click.self="ui.actionSheet?.resolve(-1)">
        <div class="wx-action-sheet" role="menu">
          <div v-if="ui.actionSheet.alertText" class="wx-action-alert">{{ ui.actionSheet.alertText }}</div>
          <div class="wx-action-group">
            <button
              v-for="(item, index) in ui.actionSheet.itemList"
              :key="index"
              type="button"
              role="menuitem"
              class="wx-action-item"
              :style="{ color: ui.actionSheet.itemColor }"
              @click="ui.actionSheet?.resolve(index)"
            >{{ item }}</button>
          </div>
          <button type="button" class="wx-action-item wx-action-cancel" @click="ui.actionSheet?.resolve(-1)">{{ systemText('cancel') }}</button>
        </div>
      </div>
    </Transition>

    <PickerSheet v-if="ui.picker" :key="ui.picker.id" :state="ui.picker" />
    <LocationViewer v-if="ui.location" :key="ui.location.id" :state="ui.location" />
  </div>
</template>
