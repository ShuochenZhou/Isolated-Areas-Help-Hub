<script setup lang="ts">
// Reproduce WeChat's navigation bar: title, contextual back or home action, menu capsule, and close
// action. Reopening after close follows the same lifecycle as returning to a WeChat application in WeChat.
import { computed } from 'vue'
import type { PageRecord } from '../page'
import { callPage } from '../page'
import { firstPage, hideApp, navigateBack, reLaunch, showApp, state } from '../router'
import { systemText } from '../system-text'
import { openActionSheet, showToast } from '../ui'

const props = defineProps<{ record: PageRecord }>()

const isBottom = computed(() => state.stack[0] === props.record)
const canGoBack = computed(() => !isBottom.value && state.stack.includes(props.record))
const showHome = computed(() => isBottom.value && !props.record.isTab && props.record.route !== firstPage)
const dark = computed(() => props.record.navText.value === 'white')

function back() {
  void navigateBack({ delta: 1 }).catch(() => undefined)
}
function home() {
  void reLaunch({ url: `/${firstPage}` }).catch(() => undefined)
}

function shareTarget(): { title: string; url: string } {
  const result = (callPage(props.record, 'onShareAppMessage', { from: 'menu' }) || {}) as { title?: string; path?: string }
  const path = String(result.path || `/${props.record.route}`).replace(/^\//, '')
  const url = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}app.html#/${path}`
  return { title: result.title || props.record.title.value || document.title, url }
}

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text) } catch { /* Shown below either way. */ }
  showToast({ title: systemText('linkCopied'), icon: 'none' })
}

async function menu() {
  const canShare = typeof navigator.share === 'function'
  const items = [systemText('share'), systemText('copyLink')]
  const choice = await openActionSheet(items)
  if (choice < 0) return
  const target = shareTarget()
  if (choice === 1 || !canShare) return copy(target.url)
  // Sharing leaves the WeChat application for WeChat's share sheet; the page hears onHide/onShow.
  hideApp()
  try { await navigator.share({ title: target.title, url: target.url }) } catch { /* Cancelled. */ }
  showApp()
}

function restart() {
  hideApp()
  setTimeout(showApp, 260)
}
</script>

<template>
  <header
    class="wx-navbar"
    :class="{ 'wx-navbar-dark': dark }"
    :style="{ background: record.navBackground.value }"
  >
    <div class="wx-navbar-left">
      <button v-if="canGoBack" class="wx-navbar-icon" type="button" :aria-label="systemText('back')" @click="back">
        <svg viewBox="0 0 24 24" width="24" height="24"><path d="M15 4.5L7.5 12l7.5 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <button v-else-if="showHome" class="wx-navbar-home" type="button" :aria-label="systemText('home')" @click="home">
        <svg viewBox="0 0 24 24" width="19" height="19"><path d="M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
      </button>
    </div>
    <h1 class="wx-navbar-title">{{ record.title.value }}</h1>
    <div class="wx-capsule" role="group">
      <button type="button" :aria-label="systemText('share')" @click="menu">
        <svg viewBox="0 0 24 24" width="22" height="22"><circle cx="5.5" cy="12" r="1.9" fill="currentColor" /><circle cx="12" cy="12" r="2.4" fill="currentColor" /><circle cx="18.5" cy="12" r="1.9" fill="currentColor" /></svg>
      </button>
      <span class="wx-capsule-divider" />
      <button type="button" :aria-label="systemText('restart')" @click="restart">
        <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8" /><circle cx="12" cy="12" r="2.6" fill="currentColor" /></svg>
      </button>
    </div>
  </header>
</template>
