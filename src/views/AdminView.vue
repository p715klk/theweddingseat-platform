<template>
  <div class="admin-host">
    <TenantErrorView v-if="tenantError" :message="tenantError" />
    <div
      v-else-if="!tenantReady"
      class="fixed inset-0 bg-gray-100 z-[10000] flex items-center justify-center text-gray-400 font-bold"
    >
      ⏳ 載入專案...
    </div>
    <div
      v-else-if="!authReady"
      class="fixed inset-0 bg-gray-100 z-[10000] flex items-center justify-center text-gray-400 font-bold"
    >
      ⏳ 驗證登入狀態...
    </div>
    <div
      v-else-if="!user"
      class="fixed inset-0 bg-gray-100 z-[10000] flex items-center justify-center p-4"
    >
      <AdminLoginForm @success="onLoggedIn" />
    </div>
    <AdminPanel
      v-else
      :slug="slug"
      :couple-names="coupleNames"
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
import AdminPanel from '@/components/admin/AdminPanel.vue';

const route = useRoute();
const { slug, ready, error, coupleNames, initTenant } = useTenant();
const { user, authReady, logout } = useAuth();
const { isPlatformAdmin, platformAdminReady } = usePlatformAdmin();

const tenantReady = computed(() => ready.value);
const tenantError = computed(() => error.value);

async function bootAdmin() {
  if (!platformAdminReady.value) return;
  await initTenant(route, {
    featureGate: 'guestlist',
    allowWhenDisabled: isPlatformAdmin.value,
  });
}

watch([platformAdminReady, () => route.params.slug], bootAdmin, { immediate: true });

function onLoggedIn() {
  /* auth state updates automatically */
}

async function handleLogout() {
  await logout();
}
</script>

<style scoped>
.admin-host {
  min-height: 100vh;
  background: #f3f4f6;
}
</style>
