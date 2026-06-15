<template>
  <div class="seating-host">
    <div
      v-if="!authReady"
      class="fixed inset-0 bg-slate-100 z-[10000] flex items-center justify-center text-gray-500 font-bold"
    >
      ⏳ 驗證登入狀態...
    </div>
    <div
      v-else-if="!user"
      class="fixed inset-0 bg-slate-100 z-[10000] flex items-center justify-center p-4"
    >
      <AdminLoginForm @success="goToSeatingCanvas" />
    </div>
    <div
      v-else
      class="fixed inset-0 bg-slate-100 z-[10000] flex flex-col items-center justify-center text-gray-600 font-bold gap-2"
    >
      <p>⏳ 前往畫布排位...</p>
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

function goToSeatingCanvas() {
  if (!slug.value) return;
  const target = appUrl(`legacy/admin/seating.html?slug=${encodeURIComponent(slug.value)}`);
  window.location.replace(target);
}

watch(
  [authReady, user, slug],
  ([ready, u, s]) => {
    if (ready && u && s) goToSeatingCanvas();
  },
  { immediate: true },
);
</script>

<style scoped>
.seating-host {
  height: 100vh;
  width: 100%;
  overflow: hidden;
  background: #0f172a;
}
</style>
