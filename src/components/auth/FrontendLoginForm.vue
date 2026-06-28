<template>
  <form class="login-card" @submit.prevent="submit">
    <h2>登入</h2>
    <p class="hint">{{ hint }}</p>
    <p v-if="postLogoutNotice" class="notice">{{ postLogoutNotice }}</p>
    <label>Email</label>
    <input v-model="email" type="email" required autocomplete="username" />
    <label>密碼</label>
    <input
      v-model="password"
      type="password"
      required
      autocomplete="current-password"
      v-on="passwordInputHandlers"
    />
    <p v-if="showCapsLockHint" class="caps-lock-hint">Caps Lock 已開啟</p>
    <p v-if="configError" class="error">{{ configError }}</p>
    <p v-if="error" class="error">{{ error }}</p>
    <button type="submit" :disabled="loading || !!configError">{{ loading ? '登入中…' : '登入' }}</button>
  </form>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useAuth } from '@/composables/useAuth';
import { useCapsLockHint } from '@/composables/useCapsLockHint';
import { mapPocketBaseLoginError } from '@/lib/pocketbaseErrors';
import { consumePostLogoutNotice } from '@/lib/logoutNotices';

const emit = defineEmits(['success']);
defineProps({
  hint: {
    type: String,
    default: '請使用 Owner 為此婚宴專案建立的帳號登入。',
  },
});
const { login, authError } = useAuth();
const { showCapsLockHint, passwordInputHandlers } = useCapsLockHint();

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const postLogoutNotice = ref(consumePostLogoutNotice());

const configError = computed(() => authError.value);

async function submit() {
  error.value = '';
  if (configError.value) return;
  loading.value = true;
  try {
    await login(email.value, password.value);
    emit('success');
  } catch (e) {
    error.value = mapPocketBaseLoginError(e);
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
  font-weight: 800;
  color: #b91c1c;
  margin: 0 0 0.25rem;
}
.hint {
  font-size: 0.75rem;
  color: #6b7280;
  margin: 0 0 1rem;
}
.notice {
  font-size: 0.75rem;
  margin: -0.25rem 0 0.75rem;
  padding: 0.55rem 0.65rem;
  border-radius: 0.5rem;
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
  font-weight: 700;
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
.caps-lock-hint {
  margin: -0.35rem 0 0.75rem;
  font-size: 0.75rem;
  color: #d97706;
  font-weight: 600;
}
button {
  width: 100%;
  background: #dc2626;
  color: #fff;
  border: none;
  border-radius: 0.5rem;
  padding: 0.5rem;
  font-weight: 800;
  cursor: pointer;
}
button:disabled {
  opacity: 0.7;
  cursor: wait;
}
</style>
