<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { http } from '@/api/http'
import type { DemandCluster, ImpactSummary, InventoryItem, SupplyRequest } from '@/api/types'
import EChart from '@/components/EChart.vue'
import type { EChartsCoreOption } from 'echarts/core'

const loading = ref(true)
const impact = ref<ImpactSummary>({ totalRequests: 0, fulfilledRequests: 0, uniqueResidentsServed: 0, fulfillmentRate: 0, medianFulfillmentMinutes: 0, completedRoutePlans: 0, routeMetersSaved: 0, feedbackResponses: 0, averageSatisfaction: 0, averageTravelMinutesSaved: 0, householdsServed: 0, peopleServed: 0, demandClustersReached: 0, stockoutIncidents: 0, stockoutRate: 0, reservationExpirationRate: 0 })
const requests = ref<SupplyRequest[]>([])
const inventory = ref<InventoryItem[]>([])
const clusters = ref<DemandCluster[]>([])

const statusOption = computed<EChartsCoreOption>(() => {
  const counts = requests.value.reduce<Record<string, number>>((result, item) => {
    result[item.status] = (result[item.status] || 0) + 1
    return result
  }, {})
  return {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { color: '#5a6b64' } },
    color: ['#d36b4b', '#e7ad59', '#4f8a73', '#7c9eb2', '#254f43'],
    series: [{ type: 'pie', radius: ['52%', '72%'], center: ['50%', '44%'], itemStyle: { borderColor: '#fff', borderWidth: 4 }, label: { formatter: '{b}\n{c}' }, data: Object.entries(counts).map(([name, value]) => ({ name, value })) }],
  }
})

const demandOption = computed<EChartsCoreOption>(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 42, right: 18, top: 20, bottom: 32 },
  xAxis: { type: 'category', data: clusters.value.map((item) => `区域 ${item.clusterId}`), axisLine: { lineStyle: { color: '#d7dfda' } } },
  yAxis: { type: 'value', splitLine: { lineStyle: { color: '#edf1ee' } } },
  series: [{ type: 'bar', barWidth: 24, data: clusters.value.map((item) => item.totalUnits), itemStyle: { color: '#d36b4b', borderRadius: [8, 8, 0, 0] } }],
}))

const lowStock = computed(() => inventory.value.filter((item) => item.freeQuantity <= item.reorderThreshold))

async function load() {
  loading.value = true
  try {
    const [impactResponse, requestResponse, inventoryResponse, clusterResponse] = await Promise.all([
      http.get<ImpactSummary>('/admin/impact'),
      http.get<SupplyRequest[]>('/admin/requests?limit=100'),
      http.get<InventoryItem[]>('/admin/inventory'),
      http.get<DemandCluster[]>('/admin/demand/clusters'),
    ])
    impact.value = impactResponse.data
    requests.value = requestResponse.data
    inventory.value = inventoryResponse.data
    clusters.value = clusterResponse.data
  } finally { loading.value = false }
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="page-stack">
    <div class="page-actions"><div><h2>今天的服务情况</h2><p>基于已完成服务记录实时计算，不包含测试数据。</p></div><el-button :icon="Refresh" @click="load">刷新数据</el-button></div>
    <section class="metric-grid">
      <article class="metric-card accent-green"><span>已服务居民</span><strong>{{ impact.peopleServed }}</strong><small>{{ impact.householdsServed }} 个家庭</small></article>
      <article class="metric-card accent-orange"><span>需求履约率</span><strong>{{ (impact.fulfillmentRate * 100).toFixed(1) }}%</strong><small>{{ impact.fulfilledRequests }} / {{ impact.totalRequests }} 项需求</small></article>
      <article class="metric-card accent-blue"><span>中位履约时间</span><strong>{{ impact.medianFulfillmentMinutes }}</strong><small>分钟</small></article>
      <article class="metric-card accent-gold"><span>路线节省</span><strong>{{ (impact.routeMetersSaved / 1000).toFixed(1) }}</strong><small>公里（相对基线）</small></article>
    </section>
    <section class="impact-strip panel"><div><span>已覆盖需求聚类</span><strong>{{ impact.demandClustersReached }}</strong></div><div><span>缺货事件</span><strong>{{ impact.stockoutIncidents }}</strong></div><div><span>缺货率</span><strong>{{ (impact.stockoutRate * 100).toFixed(1) }}%</strong></div><div><span>预约过期率</span><strong>{{ (impact.reservationExpirationRate * 100).toFixed(1) }}%</strong></div><div><span>满意度</span><strong>{{ impact.averageSatisfaction.toFixed(1) }} / 5</strong></div></section>
    <section class="dashboard-grid">
      <article class="panel"><div class="panel-header"><div><h3>需求状态</h3><p>最近 100 条申请</p></div></div><EChart :option="statusOption" /></article>
      <article class="panel"><div class="panel-header"><div><h3>服务盲区需求量</h3><p>按地理聚类汇总的物资单位</p></div><span class="panel-count">{{ clusters.length }} 个区域</span></div><EChart :option="demandOption" /></article>
      <article class="panel full-width alert-panel">
        <div class="panel-header"><div><h3>库存预警</h3><p>可用数量已达到补货阈值</p></div><router-link to="/inventory">管理库存 →</router-link></div>
        <div v-if="lowStock.length" class="alert-list"><div v-for="item in lowStock" :key="item.id" class="alert-row"><span class="status-dot warning"></span><strong>{{ item.name }}</strong><span>{{ item.freeQuantity }} {{ item.unit }} 可用</span><small>阈值 {{ item.reorderThreshold }}</small></div></div>
        <el-empty v-else description="当前没有库存预警" :image-size="64" />
      </article>
    </section>
  </div>
</template>
