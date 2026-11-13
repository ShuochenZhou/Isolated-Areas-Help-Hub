<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DataAnalysis, Box, Location, Guide, Tickets, SwitchButton, Document, Wallet } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const active = computed(() => route.path)

function logout() {
  auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">邻</div>
        <div><strong>Help Hub</strong><span>社区物资服务</span></div>
      </div>
      <el-menu :default-active="active" router class="nav-menu">
        <el-menu-item index="/dashboard"><el-icon><DataAnalysis /></el-icon><span>运营概览</span></el-menu-item>
        <el-menu-item index="/requests"><el-icon><Tickets /></el-icon><span>需求审核</span></el-menu-item>
        <el-menu-item index="/inventory"><el-icon><Box /></el-icon><span>库存管理</span></el-menu-item>
        <el-menu-item index="/operations-map"><el-icon><Location /></el-icon><span>需求地图</span></el-menu-item>
        <el-menu-item index="/routes"><el-icon><Guide /></el-icon><span>路线调度</span></el-menu-item>
        <el-menu-item v-if="auth.role === 'ADMIN'" index="/payments"><el-icon><Wallet /></el-icon><span>支付退款</span></el-menu-item>
        <el-menu-item v-if="auth.role === 'ADMIN'" index="/system-records"><el-icon><Document /></el-icon><span>系统记录</span></el-menu-item>
      </el-menu>
      <div class="sidebar-footer">
        <div class="operator"><span class="avatar">{{ auth.displayName.slice(0, 1) || '管' }}</span><div><strong>{{ auth.displayName || '管理员' }}</strong><small>{{ auth.role }}</small></div></div>
        <el-button text :icon="SwitchButton" @click="logout">退出</el-button>
      </div>
    </aside>
    <main class="main-content">
      <header class="topbar">
        <div><p class="eyebrow">ISOLATED AREAS HELP HUB</p><h1>{{ route.meta.title || '社区服务运营台' }}</h1></div>
        <div class="live-pill"><span></span>系统运行中</div>
      </header>
      <router-view />
    </main>
  </div>
</template>
