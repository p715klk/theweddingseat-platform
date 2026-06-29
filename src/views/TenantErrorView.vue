<template>
  <div class="error-page" :class="{ 'error-page--embedded': embedded }">
    <div class="error-body">
      <div class="card">
        <p class="icon">⚠️</p>
        <h1>無法載入宴會專案</h1>
        <p>{{ message }}</p>
      </div>
    </div>
    <AppFooter v-if="!embedded" />
  </div>
</template>

<script setup>
import AppFooter from '@/components/AppFooter.vue';

defineProps({
  message: { type: String, default: '發生錯誤' },
  embedded: { type: Boolean, default: false },
});
</script>

<style scoped>
.error-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f3f4f6;
}
.error-page--embedded {
  min-height: auto;
  background: transparent;
}
.error-body {
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
  text-align: center;
  box-shadow: 0 4px 6px rgb(0 0 0 / 0.1);
}
.icon {
  font-size: 2rem;
  margin: 0 0 1rem;
}
h1 {
  color: #b91c1c;
  font-size: 1.25rem;
  margin: 0 0 0.5rem;
}
p {
  color: #4b5563;
  margin: 0;
}
</style>
