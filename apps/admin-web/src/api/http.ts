import axios from 'axios'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 12_000,
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('help-hub-token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (['post', 'put', 'patch', 'delete'].includes(config.method || '')) {
    config.headers['Idempotency-Key'] = crypto.randomUUID()
  }
  config.headers['X-Request-ID'] = crypto.randomUUID()
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('help-hub-token')
      if (!location.pathname.startsWith('/login')) location.assign('/login')
    }
    return Promise.reject(error)
  },
)

