<template>
  <div class="admin-host">
    <div
      v-if="!authReady"
      class="fixed inset-0 bg-gray-100 z-[10000] flex items-center justify-center text-gray-400 font-bold"
    >
      ⏳ 驗證登入狀態...
    </div>
    <div
      v-else-if="!user"
      class="fixed inset-0 bg-gray-100 z-[10000] flex items-center justify-center p-4"
    >
      <AdminLoginForm @success="goToLegacyAdmin" />
    </div>
    <div
      v-else
      class="fixed inset-0 bg-gray-100 z-[10000] flex flex-col items-center justify-center text-gray-600 font-bold gap-2"
    >
      <p>⏳ 前往賓客名單後台...</p>
      <p v-if="slug" class="text-xs text-gray-400 font-normal">{{ slug }}</p>
    </div>
  </div>
</template>

<script setup>
import { watch } from 'vue';
import { useRoute } from 'vue-router';
import { useTenant } from '@/composables/useTenant';
import { useAuth } from '@/composables/useAuth';
import { appUrl } from '@/lib/appBase';
import AdminLoginForm from '@/components/auth/AdminLoginForm.vue';

const route = useRoute();
const { slug, initTenant } = useTenant();
const { user, authReady } = useAuth();

initTenant(route, { allowExpired: true });

function goToLegacyAdmin() {
  if (!slug.value) return;
  const target = appUrl(`legacy/admin/admin.html?slug=${encodeURIComponent(slug.value)}`);
  window.location.replace(target);
}

watch(
  [authReady, user, slug],
  ([ready, u, s]) => {
    if (ready && u && s) goToLegacyAdmin();
  },
  { immediate: true },
);
</script>

<style scoped>
.admin-host {
  min-height: 100vh;
  background: #f3f4f6;
}
</style>
