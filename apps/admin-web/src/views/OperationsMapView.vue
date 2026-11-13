<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { http } from '@/api/http'
import type { DemandCluster, SupplyRequest } from '@/api/types'
import OperationsMap from '@/components/OperationsMap.vue'

const clusters = ref<DemandCluster[]>([])
const requests = ref<SupplyRequest[]>([])
const radius = ref(1500)
const minimumPoints = ref(3)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const [clusterResponse, requestResponse] = await Promise.all([
      http.get('/admin/demand/clusters', { params: { radiusMeters: radius.value, minimumPoints: minimumPoints.value } }),
      http.get('/admin/requests', { params: { limit: 100 } }),
    ])
    clusters.value = clusterResponse.data
    requests.value = requestResponse.data.filter((item: SupplyRequest) => ['SUBMITTED','UNDER_REVIEW','APPROVED'].includes(item.status))
  } finally { loading.value = false }
}
onMounted(load)
</script>

<template>
  <div class="page-stack">
    <div class="page-actions"><div><h2>需求覆盖地图</h2><p>基于未完成需求识别服务盲区，辅助移动物资车选址。</p></div><div class="filter-row"><span>聚类半径</span><el-input-number v-model="radius" :min="100" :max="10000" :step="100" /><span>最少需求</span><el-input-number v-model="minimumPoints" :min="2" :max="20" /><el-button type="primary" @click="load">重新计算</el-button></div></div>
    <section class="map-layout" v-loading="loading">
      <article class="panel map-panel"><OperationsMap :clusters="clusters" :requests="requests" /></article>
      <aside class="cluster-list"><article v-for="cluster in clusters" :key="cluster.clusterId" class="cluster-card"><div><span>区域 {{ cluster.clusterId }}</span><strong>{{ cluster.totalUnits }}<small> 单位物资</small></strong></div><p>{{ cluster.requestCount }} 项居民需求 · {{ cluster.urgencyCounts.CRITICAL || 0 }} 项极紧急</p><small>{{ cluster.centroidLatitude.toFixed(5) }}, {{ cluster.centroidLongitude.toFixed(5) }}</small></article><el-empty v-if="!clusters.length" description="当前参数下没有形成需求聚类" /></aside>
    </section>
  </div>
</template>

