<template>
  <div class="not-found-page">
    <div class="not-found-body">
      <div class="card">
        <p class="icon">🔍</p>
        <h1>找不到此頁面</h1>
        <p class="hint">你輸入嘅網址不存在，或連結可能已失效。</p>
        <div class="actions">
          <router-link to="/p/demo" class="btn-primary">前往 demo 點名頁</router-link>
          <button type="button" class="btn-secondary" @click="goBack">返回上一頁</button>
        </div>
      </div>
    </div>
    <AppFooter />
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import AppFooter from '@/components/AppFooter.vue';

const router = useRouter();

function goBack() {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  router.push('/p/demo');
}
</script>

<style scoped>
.not-found-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f3f4f6;
}
.not-found-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}
.card {
  background: #fff;
  border-radius: 0.75rem;
  padding: 2rem;
  max-width: 28rem;
  width: 100%;
  text-align: center;
  box-shadow: 0 4px 6px rgb(0 0 0 / 0.1);
  border: 1px solid #e5e7eb;
}
.icon {
  font-size: 2rem;
  margin: 0 0 1rem;
}
h1 {
  color: #b91c1c;
  font-size: 1.25rem;
  font-weight: 800;
  margin: 0 0 0.5rem;
}
.hint {
  color: #4b5563;
  font-size: 0.875rem;
  line-height: 1.5;
  margin: 0 0 1.25rem;
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
  padding: 0.625rem;
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
