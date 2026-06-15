<template>
  <form class="login-card" @submit.prevent="submit">
    <h2>後台登入</h2>
    <p class="hint">請使用 Firebase Console 建立嘅帳號</p>
    <label>Email</label>
    <input v-model="email" type="email" required autocomplete="username" />
    <label>密碼</label>
    <input v-model="password" type="password" required autocomplete="current-password" />
    <p v-if="configError" class="error">{{ configError }}</p>
    <p v-if="error" class="error">{{ error }}</p>
    <button type="submit" :disabled="loading || !!configError">{{ loading ? '登入中…' : '登入' }}</button>
  </form>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useAuth } from '@/composables/useAuth';

const emit = defineEmits(['success']);
const { login, authError } = useAuth();

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

const configError = computed(() => authError.value);

async function submit() {
  error.value = '';
  if (configError.value) return;
  loading.value = true;
  try {
    await login(email.value, password.value);
    emit('success');
  } catch (e) {
    const code = e?.code || '';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      error.value = 'Email 或密碼錯誤';
    } else if (code === 'auth/too-many-requests') {
      error.value = '嘗試次數過多，請稍後再試';
    } else {
      error.value = e?.message || '登入失敗';
    }
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-card {
  background: #fff;
  border-radius: 0.75rem;
  padding: 1.5rem;
  width: 100%;
  max-width: 22rem;
  border: 1px solid #e5e7eb;
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
}
.login-card h2 {
  font-size: 1.125rem;
  font-weight: 700;
  color: #b91c1c;
  margin: 0 0 0.25rem;
}
.hint {
  font-size: 0.75rem;
  color: #6b7280;
  margin: 0 0 1rem;
}
label {
  display: block;
  font-size: 0.75rem;
  font-weight: 700;
  color: #4b5563;
  margin-bottom: 0.25rem;
}
input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  padding: 0.5rem;
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
}
.error {
  color: #dc2626;
  font-size: 0.75rem;
  margin-bottom: 0.5rem;
}
button {
  width: 100%;
  background: #dc2626;
  color: #fff;
  border: none;
  border-radius: 0.5rem;
  padding: 0.5rem;
  font-weight: 700;
  cursor: pointer;
}
button:disabled {
  opacity: 0.7;
  cursor: wait;
}
</style>
