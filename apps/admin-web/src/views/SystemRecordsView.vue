<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Download, Refresh } from '@element-plus/icons-vue'
import { http } from '@/api/http'

interface AuditRow { id: number; actor?: string; action: string; entityType: string; entityId: string; correlationId: string; createdAt: string }
interface DeliveryRow { id: number; recipient: string; template: string; channel: string; status: string; attempts: number; error?: string; createdAt: string }

const tab = ref('audit')
const loading = ref(false)
const audits = ref<AuditRow[]>([])
const deliveries = ref<DeliveryRow[]>([])

async function load() {
  loading.value = true
  try {
    const [auditResponse, deliveryResponse] = await Promise.all([
      http.get<AuditRow[]>('/admin/audit'), http.get<DeliveryRow[]>('/admin/notification-deliveries'),
    ])
    audits.value = auditResponse.data
    deliveries.value = deliveryResponse.data
  } finally { loading.value = false }
}

async function exportImpact() {
  const response = await http.get('/admin/impact/export', { responseType: 'blob' })
  const url = URL.createObjectURL(response.data)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'help-hub-impact.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}

onMounted(load)
</script>

<template>
  <div class="page-stack">
    <div class="page-actions"><div><h2>系统记录</h2><p>追踪管理员操作与异步通知结果，支持审计和问题排查。</p></div><div><el-button :icon="Download" @click="exportImpact">导出成效数据</el-button><el-button :icon="Refresh" @click="load">刷新</el-button></div></div>
    <article class="panel table-panel">
      <el-tabs v-model="tab">
        <el-tab-pane label="操作审计" name="audit">
          <el-table v-loading="loading" :data="audits" stripe>
            <el-table-column prop="createdAt" label="时间" min-width="180" />
            <el-table-column prop="actor" label="操作人" width="130" />
            <el-table-column prop="action" label="动作" min-width="210" />
            <el-table-column prop="entityType" label="对象" width="150" />
            <el-table-column prop="entityId" label="对象编号" width="120" />
            <el-table-column prop="correlationId" label="关联编号" min-width="280" show-overflow-tooltip />
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="通知投递" name="notifications">
          <el-table v-loading="loading" :data="deliveries" stripe>
            <el-table-column prop="createdAt" label="时间" min-width="180" />
            <el-table-column prop="recipient" label="接收人" width="130" />
            <el-table-column prop="template" label="通知类型" min-width="220" />
            <el-table-column prop="channel" label="渠道" width="100" />
            <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="row.status === 'SENT' ? 'success' : row.status === 'FAILED' ? 'danger' : 'warning'" effect="plain">{{ row.status }}</el-tag></template></el-table-column>
            <el-table-column prop="attempts" label="尝试" width="80" />
            <el-table-column prop="error" label="错误" min-width="260" show-overflow-tooltip />
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </article>
  </div>
</template>
