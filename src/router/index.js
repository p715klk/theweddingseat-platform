import { createRouter, createWebHistory } from 'vue-router';

const CheckInView = () => import('@/views/CheckInView.vue');
const AdminView = () => import('@/views/AdminView.vue');
const SeatingView = () => import('@/views/SeatingView.vue');
const TenantErrorView = () => import('@/views/TenantErrorView.vue');
const SuperAdminShell = () => import('@/views/super/SuperAdminShell.vue');
const SuperTenantsView = () => import('@/views/super/SuperTenantsView.vue');
const SuperCreateTenantView = () => import('@/views/super/SuperCreateTenantView.vue');
const SuperTenantDetailView = () => import('@/views/super/SuperTenantDetailView.vue');

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/p/demo' },
    {
      path: '/p/:slug',
      name: 'checkin',
      component: CheckInView,
    },
    {
      path: '/p/:slug/admin',
      name: 'admin',
      component: AdminView,
      meta: { requiresAuth: true },
    },
    {
      path: '/p/:slug/seating',
      name: 'seating',
      component: SeatingView,
      meta: { requiresAuth: true },
    },
    {
      path: '/super',
      component: SuperAdminShell,
      children: [
        { path: '', redirect: '/super/tenants' },
        {
          path: 'tenants',
          name: 'super-tenants',
          component: SuperTenantsView,
        },
        {
          path: 'tenants/new',
          name: 'super-tenant-new',
          component: SuperCreateTenantView,
        },
        {
          path: 'tenants/:slug',
          name: 'super-tenant-detail',
          component: SuperTenantDetailView,
        },
      ],
    },
    {
      path: '/error',
      name: 'error',
      component: TenantErrorView,
    },
  ],
});

router.beforeEach(async () => true);

export default router;
