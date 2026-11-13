<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import { useAuthStore } from '@/stores/auth'

const phone = ref('')
const password = ref('')
const loading = ref(false)
const auth = useAuthStore()
const router = useRouter()

async function login() {
  loading.value = true
  try {
    await auth.operatorLogin(phone.value, password.value)
    await router.push('/dashboard')
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '登录失败，请检查后端服务')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <section class="login-story">
      <div class="story-content">
        <span class="story-badge">Millennium Fellowship · 2024</span>
        <h1>让日常必需品<br />抵达每一个社区</h1>
        <p>识别服务盲区，协调移动物资车，用可核验的数据衡量每一次帮助。</p>
        <div class="story-stat"><strong>上海</strong><span>社区需求与移动服务协调平台</span></div>
      </div>
    </section>
    <section class="login-panel">
      <div class="login-card">
        <div class="logo-large">邻</div>
        <p class="eyebrow">ISOLATED AREAS HELP HUB</p>
        <h2>运营人员登录</h2>
        <p class="muted">仅限邻需通授权运营人员使用。</p>
        <el-form label-position="top" @submit.prevent="login">
          <el-form-item label="账号">
            <el-input v-model="phone" size="large" maxlength="32" placeholder="例如 kd001" />
          </el-form-item>
          <el-form-item label="运营密码">
            <el-input v-model="password" type="password" size="large" show-password autocomplete="current-password" />
          </el-form-item>
          <el-button type="primary" size="large" :loading="loading" class="login-button" @click="login">进入运营台</el-button>
        </el-form>
        <small class="security-note">登录行为将写入安全审计记录</small>
      </div>
    </section>
  </div>
</template>
