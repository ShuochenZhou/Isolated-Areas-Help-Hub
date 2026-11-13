<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import { http } from '@/api/http'
import type { InventoryItem } from '@/api/types'
import { useAuthStore } from '@/stores/auth'

const items = ref<InventoryItem[]>([])
const loading = ref(false)
const dialog = ref(false)
const selected = ref<InventoryItem>()
const delta = ref(0)
const priceYuan = ref(0)
const auth = useAuthStore()

async function load() { loading.value = true; try { items.value = (await http.get('/admin/inventory')).data } finally { loading.value = false } }
function open(item: InventoryItem) { selected.value = item; delta.value = 0; priceYuan.value = item.unitPriceFen / 100; dialog.value = true }
async function save() {
  if (!selected.value) return
  let current = selected.value
  const priceFen = Math.round(priceYuan.value * 100)
  if (priceFen !== current.unitPriceFen) {
    current = (await http.patch<InventoryItem>(`/admin/inventory/${current.id}/price`, { unitPriceFen: priceFen, version: current.version })).data
  }
  if (delta.value !== 0) {
    current = (await http.patch<InventoryItem>(`/admin/inventory/${current.id}`, { delta: delta.value, version: current.version })).data
  }
  selected.value = current
  ElMessage.success('库存与价格已更新'); dialog.value = false; await load()
}
onMounted(load)
</script>

<template>
  <div class="page-stack">
    <div class="page-actions"><div><h2>库存管理</h2><p>预约数量已从可分配库存中扣除；所有调整均保留审计记录。</p></div></div>
    <section class="inventory-grid" v-loading="loading">
      <article v-for="item in items" :key="item.id" class="inventory-card">
        <div class="inventory-top"><span class="category-icon">{{ item.category.slice(0, 1) }}</span><el-tag v-if="item.freeQuantity <= item.reorderThreshold" type="warning">需要补货</el-tag></div>
        <small>{{ item.sku }}</small><h3>{{ item.name }}</h3>
        <div class="stock-number"><strong>{{ item.freeQuantity }}</strong><span>{{ item.unit }} 可分配</span></div>
        <el-progress :percentage="Math.min(100, Math.round(item.freeQuantity / Math.max(item.availableQuantity, 1) * 100))" :show-text="false" />
        <div class="stock-meta"><span>总库存 {{ item.availableQuantity }}</span><span>已预约 {{ item.reservedQuantity }}</span></div>
        <div class="stock-meta"><span>居民价</span><strong>{{ item.unitPriceFen ? `¥${(item.unitPriceFen / 100).toFixed(2)}` : '公益免费' }}</strong></div>
        <el-button v-if="auth.role === 'ADMIN'" plain @click="open(item)">调整库存</el-button>
      </article>
    </section>
    <el-dialog v-model="dialog" title="库存与价格" width="420px"><p v-if="selected">{{ selected.name }} 当前总库存：{{ selected.availableQuantity }}</p><p>库存增减</p><el-input-number v-model="delta" :min="-10000" :max="10000" /><p>居民单价（元，0 表示公益免费）</p><el-input-number v-model="priceYuan" :min="0" :max="10000" :precision="2" :step="0.5" /><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template></el-dialog>
  </div>
</template>
