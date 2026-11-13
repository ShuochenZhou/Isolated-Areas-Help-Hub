<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import { http } from '@/api/http'
import type { PaymentOrder } from '@/api/types'

const rows = ref<PaymentOrder[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try { rows.value = (await http.get<PaymentOrder[]>('/admin/payments')).data }
  finally { loading.value = false }
}

async function refund(row: PaymentOrder) {
  const { value } = await ElMessageBox.prompt('请输入退款原因；系统将执行原路全额退款。', `退款 ¥${(row.amountFen / 100).toFixed(2)}`, {
    inputValue: '管理员取消未领取预约', inputValidator: (text) => Boolean(text && text.trim()),
  })
  await http.post(`/admin/payments/${row.paymentId}/refund`, { reason: value })
  ElMessage.success('退款申请已提交微信支付')
  await load()
}

function refundRow(row: unknown) { return refund(row as PaymentOrder) }

function tag(status: string) {
  if (status === 'SUCCESS') return 'success'
  if (status === 'REFUNDED') return 'info'
  if (status === 'FAILED') return 'danger'
  return 'warning'
}

onMounted(load)
</script>

<template>
  <div class="page-stack">
    <div class="page-actions"><div><h2>支付与退款</h2><p>金额以数据库价格为准；只有通过微信支付验签的订单才显示为成功。</p></div><el-button :icon="Refresh" @click="load">刷新</el-button></div>
    <article class="panel table-panel">
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="createdAt" label="创建时间" min-width="180" />
        <el-table-column prop="outTradeNo" label="商户订单号" min-width="245" show-overflow-tooltip />
        <el-table-column prop="reservationId" label="预约" width="90"><template #default="{ row }">#{{ row.reservationId }}</template></el-table-column>
        <el-table-column prop="itemName" label="物资" min-width="150" />
        <el-table-column label="金额" width="110"><template #default="{ row }">¥{{ (row.amountFen / 100).toFixed(2) }}</template></el-table-column>
        <el-table-column label="状态" width="120"><template #default="{ row }"><el-tag :type="tag(row.status)">{{ row.status }}</el-tag></template></el-table-column>
        <el-table-column prop="transactionId" label="微信支付单号" min-width="220" show-overflow-tooltip />
        <el-table-column label="操作" width="110" fixed="right"><template #default="{ row }"><el-button v-if="row.status === 'SUCCESS'" link type="danger" @click="refundRow(row)">全额退款</el-button></template></el-table-column>
      </el-table>
    </article>
  </div>
</template>
