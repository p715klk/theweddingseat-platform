import { createRouter, createWebHistory } from 'vue-router';

const CheckInView = () => import('@/views/CheckInView.vue');
const AdminView = () => import('@/views/AdminView.vue');
const SeatingView = () => import('@/views/SeatingView.vue');
const TenantErrorView = () => import('@/views/TenantErrorView.vue');

const router = createRouter({
  history: createWebHistory(),
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
      path: '/error',
      name: 'error',
      component: TenantErrorView,
    },
  ],
});

router.beforeEach(async () => true);

export default router;
