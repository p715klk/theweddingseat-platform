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
      <AdminLoginForm />
    </div>
    <iframe
      v-else-if="iframeSrc"
      :key="iframeSrc"
      :src="iframeSrc"
      class="seating-frame"
      title="畫布排位"
    />
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useTenant } from '@/composables/useTenant';
import { useAuth } from '@/composables/useAuth';
import AdminLoginForm from '@/components/auth/AdminLoginForm.vue';

const route = useRoute();
const { slug, initTenant } = useTenant();
const { user, authReady } = useAuth();

onMounted(() => initTenant(route));

const iframeSrc = computed(() => {
  if (!slug.value || !user.value) return '';
  return `/legacy/admin/seating.html?slug=${encodeURIComponent(slug.value)}`;
});
</script>

<style scoped>
.seating-host {
  height: 100vh;
  width: 100%;
  overflow: hidden;
  background: #0f172a;
}
.seating-frame {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
}
</style>
