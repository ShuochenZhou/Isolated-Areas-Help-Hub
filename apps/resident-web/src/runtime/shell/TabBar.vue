<script setup lang="ts">
// WeChat's tab bar, drawn from app.json's tabBar (colors, texts set by wx.setTabBarItem, badges).
// app.json gives no icons, so each tab gets a simple line icon in the configured colors.
import { assets } from 'virtual:miniapp'
import { callPage } from '../page'
import { state, switchTab, tabBar } from '../router'

const props = defineProps<{ route: string }>()

// Line icons by position in app.json's list: home, map, request, progress, me.
const ICONS = [
  'M4 10.6L12 4l8 6.6V19a1.2 1.2 0 0 1-1.2 1.2H15v-5.4H9v5.4H5.2A1.2 1.2 0 0 1 4 19z',
  'M9 4.5l6 2.2 5-1.9v14.7l-5 1.9-6-2.2-5 1.9V6.4zM9 4.5v14.7M15 6.7v14.7',
  'M12 3.8a8.2 8.2 0 1 1 0 16.4 8.2 8.2 0 0 1 0-16.4zM12 8.2v7.6M8.2 12h7.6',
  'M5 6.5h1.5M5 12h1.5M5 17.5h1.5M9.5 6.5H19M9.5 12H19M9.5 17.5H19',
  'M12 12.2a3.9 3.9 0 1 0 0-7.8 3.9 3.9 0 0 0 0 7.8zM4.8 20c.6-3.7 3.5-5.8 7.2-5.8s6.6 2.1 7.2 5.8'
]

function icon(index: number) {
  return ICONS[index] || ICONS[0]
}

async function tap(index: number) {
  const item = tabBar.items[index]
  try { await switchTab({ url: `/${item.pagePath}` }) } catch { return }
  const page = state.stack[0]
  if (page) callPage(page, 'onTabItemTap', { index, pagePath: item.pagePath, text: item.text })
}
</script>

<template>
  <nav
    class="wx-tabbar"
    :class="{ 'wx-tabbar-white': tabBar.borderStyle === 'white' }"
    :style="{ background: tabBar.backgroundColor }"
  >
    <button
      v-for="(item, index) in tabBar.items"
      :key="item.pagePath"
      type="button"
      class="wx-tabbar-item"
      :class="{ 'wx-tabbar-selected': item.pagePath === props.route }"
      :style="{ color: item.pagePath === props.route ? tabBar.selectedColor : tabBar.color }"
      :aria-current="item.pagePath === props.route ? 'page' : undefined"
      @click="tap(index)"
    >
      <span class="wx-tabbar-icon">
        <img v-if="item.iconPath && assets[item.iconPath]" :src="assets[item.pagePath === props.route && item.selectedIconPath ? item.selectedIconPath : item.iconPath]" alt="">
        <svg v-else viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <path :d="icon(index)" fill="none" stroke="currentColor" :stroke-width="item.pagePath === props.route ? 2 : 1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span v-if="item.badge" class="wx-tabbar-badge">{{ item.badge }}</span>
        <span v-else-if="item.redDot" class="wx-tabbar-dot" />
      </span>
      <span class="wx-tabbar-text">{{ item.text }}</span>
    </button>
  </nav>
</template>
