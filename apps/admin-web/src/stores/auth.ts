import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { http } from '@/api/http'

interface LoginResponse {
  accessToken: string
  expiresAt: string
  userId: number
  displayName: string
  role: string
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('help-hub-token') || '')
  const displayName = ref(localStorage.getItem('help-hub-name') || '')
  const role = ref(localStorage.getItem('help-hub-role') || '')
  const authenticated = computed(() => Boolean(token.value))

  async function operatorLogin(phone: string, password: string) {
    const { data } = await http.post<LoginResponse>('/auth/operator-login', { phone, password })
    token.value = data.accessToken
    displayName.value = data.displayName
    role.value = data.role
    localStorage.setItem('help-hub-token', data.accessToken)
    localStorage.setItem('help-hub-name', data.displayName)
    localStorage.setItem('help-hub-role', data.role)
  }

  function logout() {
    token.value = ''
    displayName.value = ''
    role.value = ''
    localStorage.removeItem('help-hub-token')
    localStorage.removeItem('help-hub-name')
    localStorage.removeItem('help-hub-role')
  }

  return { token, displayName, role, authenticated, operatorLogin, logout }
})
