<template>
  <div class="denied-wrap">
    <div class="denied-card">
      <h2>無權進入此頁面</h2>
      <p v-if="memberRole === 'reception'" class="hint">
        你嘅帳號係<strong>現場接待</strong>，只可使用點名頁（點名、取消賓客、現場加座）。
      </p>
      <p v-else class="hint">
        你嘅帳號無權進入後台或畫布排位。如有需要，請聯絡專案 Owner。
      </p>
      <div class="actions">
        <router-link :to="checkinRoute" class="btn-primary">返回點名頁</router-link>
        <button type="button" class="btn-secondary" @click="emit('logout')">登出</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useTenantAccess } from '@/composables/useTenantAccess';

const emit = defineEmits(['logout']);

const route = useRoute();
const { memberRole } = useTenantAccess();

const checkinRoute = computed(() => `/p/${route.params.slug || 'demo'}`);
</script>

<style scoped>
.denied-wrap {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: #f3f4f6;
}
.denied-card {
  width: 100%;
  max-width: 22rem;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  padding: 1.5rem;
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
}
.denied-card h2 {
  margin: 0 0 0.5rem;
  font-size: 1.125rem;
  font-weight: 800;
  color: #b91c1c;
}
.hint {
  margin: 0 0 1rem;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: #4b5563;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.btn-primary,
.btn-secondary {
  display: block;
  width: 100%;
  text-align: center;
  border-radius: 0.5rem;
  padding: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 800;
  text-decoration: none;
  cursor: pointer;
}
.btn-primary {
  background: #b91c1c;
  color: #fff;
  border: none;
}
.btn-secondary {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
}
</style>
