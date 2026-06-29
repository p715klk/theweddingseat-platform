<template>
  <div class="seating-host">
    <TenantErrorView v-if="tenantError" embedded :message="tenantError" />
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
      v-else-if="!user || !loginGuardReady"
      class="fixed inset-0 bg-slate-100 z-[10000] flex items-center justify-center p-4"
    >
      <div v-if="user && !loginGuardReady" class="text-gray-500 font-bold">⏳ 驗證專案權限...</div>
      <LoginForm
        v-else
        title="後台登入"
        hint="請使用管理員帳號登入"
        @success="onLoggedIn"
      />
    </div>
    <div
      v-else-if="!tenantAccessReady"
      class="fixed inset-0 bg-slate-100 z-[10000] flex items-center justify-center text-gray-500 font-bold"
    >
      ⏳ 驗證權限...
    </div>
    <TenantAccessDenied
      v-else-if="!canAccessAdmin"
      @logout="handleLogout"
    />
    <div v-else class="seating-canvas-shell">
      <SeatingCanvasApp
        :key="slug"
        :slug="slug"
        @logout="handleLogout"
      />
    </div>
    <AppFooter v-if="showSeatingFooter" />
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
import { AUDIT_PAGES, setAuditPageContext } from '@/lib/auditLog';
import TenantErrorView from '@/views/TenantErrorView.vue';
import LoginForm from '@/components/auth/LoginForm.vue';
import TenantAccessDenied from '@/components/auth/TenantAccessDenied.vue';
import SeatingCanvasApp from '@/components/seating/SeatingCanvasApp.vue';
import AppFooter from '@/components/AppFooter.vue';

const route = useRoute();
const { slug, ready, error, initTenant, tenantId } = useTenant();
const { user, authReady, logout } = useAuth();
const { isPlatformAdmin, platformAdminReady } = usePlatformAdmin();
const { canAccessAdmin, tenantAccessReady } = useTenantAccess();
const { loginGuardReady } = useTenantLoginGuard('admin');

const tenantReady = computed(() => ready.value);
const tenantError = computed(() => error.value);
const showSeatingFooter = computed(
  () => tenantReady.value && authReady.value && !!user.value && loginGuardReady.value && tenantAccessReady.value && canAccessAdmin.value,
);

async function bootSeating() {
  if (!platformAdminReady.value) return;
  await initTenant(route, {
    featureGate: 'seating',
    allowWhenDisabled: isPlatformAdmin.value,
  });
}

watch([platformAdminReady, () => route.params.slug], bootSeating, { immediate: true });

watch(
  tenantId,
  (tid) => {
    if (tid) setAuditPageContext({ tenantId: tid, page: AUDIT_PAGES.SEATING });
  },
  { immediate: true },
);

function onLoggedIn() {
  /* auth state updates automatically */
}

async function handleLogout() {
  await logout();
}
</script>

<style scoped>
.seating-host {
  background: #f1f5f9;
}
.seating-canvas-shell {
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}
</style>
