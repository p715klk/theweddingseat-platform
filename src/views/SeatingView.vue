<template>
  <div class="seating-host">
    <TenantErrorView v-if="tenantError" :message="tenantError" />
    <div
      v-else-if="!tenantReady"
      class="fixed inset-0 bg-slate-100 z-[10000] flex items-center justify-center text-gray-500 font-bold"
    >
      ⏳ 載入專案...
    </div>
    <div
      v-else-if="!authReady"
      class="fixed inset-0 bg-slate-100 z-[10000] flex items-center justify-center text-gray-500 font-bold"
    >
      ⏳ 驗證登入狀態...
    </div>
    <div
      v-else-if="!user"
      class="fixed inset-0 bg-slate-100 z-[10000] flex items-center justify-center p-4"
    >
      <AdminLoginForm />
    </div>
    <SeatingCanvasApp
      v-else
      :key="slug"
      :slug="slug"
      @logout="handleLogout"
    />
  </div>
</template>

<script setup>
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useTenant } from '@/composables/useTenant';
import { useAuth } from '@/composables/useAuth';
import { usePlatformAdmin } from '@/composables/usePlatformAdmin';
import TenantErrorView from '@/views/TenantErrorView.vue';
import AdminLoginForm from '@/components/auth/AdminLoginForm.vue';
import SeatingCanvasApp from '@/components/seating/SeatingCanvasApp.vue';

const route = useRoute();
const { slug, ready, error, initTenant } = useTenant();
const { user, authReady, logout } = useAuth();
const { isPlatformAdmin, platformAdminReady } = usePlatformAdmin();

const tenantReady = computed(() => ready.value);
const tenantError = computed(() => error.value);

async function bootSeating() {
  if (!platformAdminReady.value) return;
  await initTenant(route, {
    featureGate: 'seating',
    allowWhenDisabled: isPlatformAdmin.value,
  });
}

watch([platformAdminReady, () => route.params.slug], bootSeating, { immediate: true });

async function handleLogout() {
  await logout();
}
</script>

<style scoped>
.seating-host {
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: #f1f5f9;
}
</style>
