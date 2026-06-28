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
      v-else-if="!user || !loginGuardReady"
      class="fixed inset-0 bg-gray-100 z-[10000] flex items-center justify-center p-4"
    >
      <div v-if="user && !loginGuardReady" class="text-gray-500 font-bold">⏳ 驗證專案權限...</div>
      <AdminLoginForm v-else @success="onLoggedIn" />
    </div>
    <div
      v-else-if="!tenantAccessReady"
      class="fixed inset-0 bg-gray-100 z-[10000] flex items-center justify-center text-gray-400 font-bold"
    >
      ⏳ 驗證權限...
    </div>
    <TenantAccessDenied
      v-else-if="!canAccessAdmin"
      @logout="handleLogout"
    />
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
import { useTenantAccess } from '@/composables/useTenantAccess';
import { useTenantLoginGuard } from '@/composables/useTenantLoginGuard';
import TenantErrorView from '@/views/TenantErrorView.vue';
import AdminLoginForm from '@/components/auth/AdminLoginForm.vue';
import TenantAccessDenied from '@/components/auth/TenantAccessDenied.vue';
import AdminPanel from '@/components/admin/AdminPanel.vue';

const route = useRoute();
const { slug, ready, error, coupleNames, initTenant } = useTenant();
const { user, authReady, logout } = useAuth();
const { isPlatformAdmin, platformAdminReady } = usePlatformAdmin();
const { canAccessAdmin, tenantAccessReady } = useTenantAccess();
const { loginGuardReady } = useTenantLoginGuard('admin');

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
