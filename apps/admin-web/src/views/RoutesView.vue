<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import { http } from '@/api/http'
import type { RoutePlanDetail, RoutePlanSummary } from '@/api/types'

const routes = ref<RoutePlanSummary[]>([])
const loading = ref(false)
const serviceDate = ref(new Date(Date.now() + 86400000).toISOString().slice(0, 10))
const selected = ref<RoutePlanDetail>()
const drawer = ref(false)
let timer: number | undefined

async function load() { loading.value = true; try { routes.value = (await http.get('/admin/routes')).data } finally { loading.value = false } }
async function create() { await http.post('/admin/routes', { serviceDate: serviceDate.value }); ElMessage.success('路线计算任务已提交'); await load() }
async function inspect(row: RoutePlanSummary) { selected.value = (await http.get<RoutePlanDetail>(`/admin/routes/${row.id}`)).data; drawer.value = true }
function saved(row: unknown) {
  const route = row as RoutePlanSummary
  return Math.max(0, (route.baselineDistanceMeters || 0) - (route.distanceMeters || 0))
}
onMounted(() => { load(); timer = window.setInterval(load, 10_000) })
onBeforeUnmount(() => timer && clearInterval(timer))
</script>

<template>
  <div class="page-stack">
    <div class="page-actions"><div><h2>路线调度</h2><p>按紧急程度、车辆容量和地理距离分配需求；计算在异步任务中执行。</p></div><div class="filter-row"><el-date-picker v-model="serviceDate" type="date" value-format="YYYY-MM-DD" :clearable="false" /><el-button type="primary" @click="create">生成配送计划</el-button></div></div>
    <article class="panel table-panel"><el-table v-loading="loading" :data="routes" @row-click="inspect"><el-table-column prop="id" label="计划" width="90"><template #default="{ row }">#{{ row.id }}</template></el-table-column><el-table-column prop="serviceDate" label="服务日期" width="130"/><el-table-column label="状态" width="130"><template #default="{ row }"><el-tag :type="row.status==='READY' ? 'success' : row.status==='FAILED' ? 'danger' : 'warning'">{{ row.status }}</el-tag></template></el-table-column><el-table-column label="路线距离"><template #default="{ row }">{{ row.distanceMeters ? (row.distanceMeters/1000).toFixed(1)+' km' : '—' }}</template></el-table-column><el-table-column label="相对基线节省"><template #default="{ row }"><strong class="positive">{{ (saved(row)/1000).toFixed(1) }} km</strong></template></el-table-column><el-table-column prop="createdAt" label="创建时间" min-width="190"/></el-table></article>
    <el-drawer v-model="drawer" title="路线停靠顺序" size="480px"><div v-if="selected" class="route-detail"><div v-for="stop in selected.stops" :key="stop.id" class="route-stop"><span>{{ stop.stopOrder }}</span><div><strong>需求 #{{ stop.requestId }}</strong><p>物资 {{ stop.demandUnits }} 单位 · 车辆 #{{ stop.cartId }}</p><small>{{ stop.latitude.toFixed(5) }}, {{ stop.longitude.toFixed(5) }}</small></div></div><el-empty v-if="!selected.stops.length" description="路线仍在计算或没有可分配需求" /></div></el-drawer>
  </div>
</template>
