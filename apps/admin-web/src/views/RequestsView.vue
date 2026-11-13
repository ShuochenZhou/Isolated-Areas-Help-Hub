<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import { http } from '@/api/http'
import type { RequestStatus, SupplyRequest } from '@/api/types'
import { actionsFor } from '@/domain/requestTransitions'

const rows = ref<SupplyRequest[]>([])
const loading = ref(false)
const status = ref<RequestStatus | ''>('')
const details = ref<SupplyRequest>()
const drawer = ref(false)
const servicePoints = ref<{ id: number; name: string }[]>([])
const carts = ref<{ id: number; name: string; status: string }[]>([])
const assignmentType = ref<'point' | 'cart'>('cart')
const assignmentId = ref<number>()

async function load() {
  loading.value = true
  try {
    const [requestResponse, pointResponse, cartResponse] = await Promise.all([
      http.get<SupplyRequest[]>('/admin/requests', { params: { status: status.value || undefined, limit: 100 } }),
      http.get('/resident/service-points', { params: { latitude: 31.2304, longitude: 121.4737, radiusMeters: 50000 } }),
      http.get('/resident/carts'),
    ])
    rows.value = requestResponse.data
    servicePoints.value = pointResponse.data
    carts.value = cartResponse.data
  }
  finally { loading.value = false }
}

async function transition(row: SupplyRequest, next: RequestStatus) {
  if (next === 'SCHEDULED' && (details.value?.id !== row.id || !assignmentId.value)) {
    inspect(row)
    ElMessage.warning('请先在详情面板选择服务点或移动补给车')
    return
  }
  await ElMessageBox.confirm(`将申请 #${row.id} 从 ${row.status} 更新为 ${next}？`, '确认状态变更', { type: 'warning' })
  try {
    await http.patch(`/admin/requests/${row.id}/status`, {
      status: next,
      servicePointId: next === 'SCHEDULED' && assignmentType.value === 'point' ? assignmentId.value : null,
      cartId: next === 'SCHEDULED' && assignmentType.value === 'cart' ? assignmentId.value : null,
    })
  } catch (error: any) {
    // A refused approval says why, e.g. not enough stock at any service point.
    ElMessage.error(error.response?.data?.message || '操作失败，请稍后重试')
    return
  }
  ElMessage.success(next === 'APPROVED' ? '已批准，库存已锁定' : '申请状态已更新')
  await load()
}

function transitionTableRow(row: unknown, next: RequestStatus) {
  return transition(row as SupplyRequest, next)
}

// Pickup requests can only be scheduled at a service point and deliveries only on a cart.
function inspect(row: SupplyRequest) {
  details.value = row
  assignmentType.value = row.fulfillmentMethod === 'PICKUP' ? 'point' : 'cart'
  assignmentId.value = undefined
  drawer.value = true
}
const methodLabel = (method: string) => (method === 'PICKUP' ? '到点自取' : '补给车配送')
onMounted(load)
</script>

<template>
  <div class="page-stack">
    <div class="page-actions"><div><h2>需求审核</h2><p>优先显示紧急程度较高且等待时间较长的申请。</p></div><el-select v-model="status" clearable placeholder="全部状态" style="width: 180px" @change="load"><el-option v-for="value in ['SUBMITTED','UNDER_REVIEW','APPROVED','SCHEDULED','FULFILLED','REJECTED']" :key="value" :label="value" :value="value" /></el-select></div>
    <article class="panel table-panel">
      <el-table v-loading="loading" :data="rows" stripe @row-click="inspect">
        <el-table-column prop="id" label="编号" width="82" />
        <el-table-column prop="residentName" label="居民" width="130" />
        <el-table-column prop="itemDescription" label="需求" min-width="220" show-overflow-tooltip />
        <el-table-column prop="quantity" label="数量" width="70" />
        <el-table-column label="领取方式" width="110"><template #default="{ row }">{{ methodLabel(row.fulfillmentMethod) }}</template></el-table-column>
        <el-table-column label="紧急程度" width="105"><template #default="{ row }"><span :class="['urgency', row.urgency.toLowerCase()]">{{ row.urgency }}</span></template></el-table-column>
        <el-table-column label="状态" width="130"><template #default="{ row }"><el-tag effect="plain">{{ row.status }}</el-tag></template></el-table-column>
        <el-table-column prop="approximateAddress" label="位置" min-width="180" show-overflow-tooltip />
        <el-table-column label="操作" min-width="220" fixed="right"><template #default="{ row }"><el-button v-for="action in actionsFor(row.status)" :key="action.status" size="small" :type="action.type as any" @click.stop="transitionTableRow(row, action.status)">{{ action.label }}</el-button></template></el-table-column>
      </el-table>
    </article>
    <el-drawer v-model="drawer" title="需求详情" size="440px">
      <div v-if="details" class="detail-list"><div><span>申请编号</span><strong>#{{ details.id }}</strong></div><div><span>物资类别</span><strong>{{ details.category }}</strong></div><div><span>需求描述</span><strong>{{ details.itemDescription }}</strong></div><div><span>数量</span><strong>{{ details.quantity }}</strong></div><div><span>领取方式</span><strong>{{ methodLabel(details.fulfillmentMethod) }}</strong></div><div v-if="details.assignedServicePointName || details.assignedCartName"><span>已分配</span><strong>{{ details.assignedServicePointName || details.assignedCartName }}</strong></div><div><span>大致地址</span><strong>{{ details.approximateAddress || '未填写' }}</strong></div><div><span>无障碍说明</span><strong>{{ details.accessibilityNotes || '无' }}</strong></div><div><span>经纬度</span><strong>{{ details.latitude }}, {{ details.longitude }}</strong></div></div>
      <p v-if="details?.status === 'APPROVED' && details.fulfillmentMethod === 'DELIVERY'" class="assignment-box">配送需求在居民锁定库存后由系统自动派出离取货点最近的补给车，无需手动分配。</p>
      <div v-if="details?.status === 'APPROVED' && details.fulfillmentMethod === 'PICKUP'" class="assignment-box">
        <h4>分配服务资源</h4>
        <el-radio-group v-model="assignmentType" disabled><el-radio-button value="cart">移动补给车</el-radio-button><el-radio-button value="point">固定服务点</el-radio-button></el-radio-group>
        <el-select v-model="assignmentId" placeholder="选择服务资源" style="width:100%;margin:14px 0">
          <el-option v-for="item in assignmentType === 'cart' ? carts : servicePoints" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-button type="primary" style="width:100%" @click="transition(details, 'SCHEDULED')">确认分配并标记已调度</el-button>
      </div>
    </el-drawer>
  </div>
</template>
