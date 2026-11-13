import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '@/views/LoginView.vue'
import AppShell from '@/layouts/AppShell.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: LoginView },
    {
      path: '/',
      component: AppShell,
      children: [
        { path: '', redirect: '/dashboard' },
        { path: 'dashboard', component: () => import('@/views/DashboardView.vue') },
        { path: 'requests', component: () => import('@/views/RequestsView.vue') },
        { path: 'inventory', component: () => import('@/views/InventoryView.vue') },
        { path: 'operations-map', component: () => import('@/views/OperationsMapView.vue') },
        { path: 'routes', component: () => import('@/views/RoutesView.vue') },
        { path: 'payments', component: () => import('@/views/PaymentsView.vue'), meta: { requiresAdmin: true } },
        { path: 'system-records', component: () => import('@/views/SystemRecordsView.vue'), meta: { requiresAdmin: true } },
      ],
    },
  ],
})

router.beforeEach((to) => {
  const token = localStorage.getItem('help-hub-token')
  if (to.path !== '/login' && !token) return '/login'
  if (to.path === '/login' && token) return '/dashboard'
  if (to.meta.requiresAdmin && localStorage.getItem('help-hub-role') !== 'ADMIN') return '/dashboard'
})

export default router
