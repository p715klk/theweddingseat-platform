<template>
  <div class="panel">
    <RouterLink to="/super/tenants" class="back">← 返回列表</RouterLink>
    <h2>帳號設定</h2>

    <section class="section">
      <h3>登入帳號</h3>
      <dl class="info-list">
        <div class="info-row">
          <dt>Email</dt>
          <dd>{{ user?.email || '—' }}</dd>
        </div>
        <div class="info-row">
          <dt>平台權限</dt>
          <dd><span class="badge ok">super admin</span></dd>
        </div>
      </dl>
    </section>

    <section class="section">
      <h3>自動登出</h3>
      <p class="hint">閒置一段時間後自動登出 Super Admin（只影響此瀏覽器分頁）。</p>
      <div class="field">
        <label for="idle-timeout">閒置超時</label>
        <select
          id="idle-timeout"
          :value="idleTimeoutMinutes"
          @change="onIdleChange"
        >
          <option v-for="opt in IDLE_TIMEOUT_OPTIONS" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
      <p v-if="idleSaved" class="ok">已儲存</p>
    </section>

    <section class="section">
      <h3>更改密碼</h3>
      <p class="hint">更改前需輸入目前密碼以確認身份。</p>
      <form class="pw-form" @submit.prevent="submitPassword">
        <div class="field">
          <label for="current-pw">目前密碼</label>
          <input
            id="current-pw"
            v-model="currentPassword"
            type="password"
            required
            autocomplete="current-password"
            v-on="passwordInputHandlers"
          />
        </div>
        <div class="field">
          <label for="new-pw">新密碼</label>
          <input
            id="new-pw"
            v-model="newPassword"
            type="password"
            required
            minlength="6"
            autocomplete="new-password"
            v-on="passwordInputHandlers"
          />
        </div>
        <div class="field">
          <label for="confirm-pw">確認新密碼</label>
          <input
            id="confirm-pw"
            v-model="confirmPassword"
            type="password"
            required
            minlength="6"
            autocomplete="new-password"
            v-on="passwordInputHandlers"
          />
        </div>
        <p v-if="showCapsLockHint" class="caps-lock-hint">Caps Lock 已開啟</p>
        <p v-if="pwMsg" :class="pwMsgOk ? 'ok' : 'error'">{{ pwMsg }}</p>
        <button type="submit" class="btn-save" :disabled="changingPw">
          {{ changingPw ? '更新中…' : '🔒 更新密碼' }}
        </button>
      </form>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useAuth } from '@/composables/useAuth';
import { useSuperAdminSettings } from '@/composables/useSuperAdminSettings';
import { useCapsLockHint } from '@/composables/useCapsLockHint';
import { setPostLogoutNotice } from '@/lib/logoutNotices';

const { user, changePassword, logout } = useAuth();
const { idleTimeoutMinutes, setIdleTimeoutMinutes, IDLE_TIMEOUT_OPTIONS } = useSuperAdminSettings();
const { showCapsLockHint, passwordInputHandlers } = useCapsLockHint();

const idleSaved = ref(false);
const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const changingPw = ref(false);
const pwMsg = ref('');
const pwMsgOk = ref(false);

let idleSavedTimer = null;

function onIdleChange(e) {
  setIdleTimeoutMinutes(Number(e.target.value));
  idleSaved.value = true;
  clearTimeout(idleSavedTimer);
  idleSavedTimer = setTimeout(() => {
    idleSaved.value = false;
  }, 2000);
}

function passwordErrorMessage(e) {
  const code = e?.code || '';
  const status = e?.status ?? e?.response?.status;
  const raw = String(e?.response?.message || e?.message || '');

  // PocketBase: re-authenticate 失敗通常是 "Failed to authenticate."
  if (
    code === 'auth/wrong-password' ||
    code === 'auth/invalid-credential' ||
    raw.includes('Failed to authenticate') ||
    raw.includes('Invalid login') ||
    (status === 400 && raw)
  ) {
    return '目前密碼不正確';
  }
  if (code === 'auth/weak-password') {
    return '新密碼太弱（至少 6 個字元）';
  }
  if (code === 'auth/requires-recent-login') {
    return '請重新登入後再改密碼';
  }
  return raw || '更新密碼失敗';
}

async function submitPassword() {
  pwMsg.value = '';
  pwMsgOk.value = false;

  if (newPassword.value.length < 6) {
    pwMsg.value = '新密碼至少需要 6 個字元';
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    pwMsg.value = '兩次輸入的新密碼不一致';
    return;
  }
  if (newPassword.value === currentPassword.value) {
    pwMsg.value = '新密碼不能與目前密碼相同';
    return;
  }

  changingPw.value = true;
  try {
    await changePassword(currentPassword.value, newPassword.value);
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    pwMsgOk.value = true;
    pwMsg.value = '密碼已更新，請重新登入';
    setPostLogoutNotice('密碼已更新，請重新登入');
    await logout();
  } catch (e) {
    pwMsgOk.value = false;
    pwMsg.value = passwordErrorMessage(e);
  } finally {
    changingPw.value = false;
  }
}
</script>

<style scoped>
.panel {
  background: #fff;
  border-radius: 0.75rem;
  border: 1px solid #e2e8f0;
  padding: 1.25rem;
}
.back {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 700;
  color: #2563eb;
  text-decoration: none;
  margin-bottom: 0.75rem;
}
h2 {
  margin: 0 0 1rem;
  font-size: 1.125rem;
}
.section {
  margin-bottom: 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid #e2e8f0;
}
.section:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}
.section h3 {
  margin: 0 0 0.5rem;
  font-size: 0.9375rem;
}
.hint {
  margin: 0 0 0.75rem;
  font-size: 0.8125rem;
  color: #64748b;
}
.info-list {
  margin: 0;
}
.info-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1rem;
  padding: 0.35rem 0;
  font-size: 0.875rem;
}
.info-row dt {
  min-width: 5.5rem;
  margin: 0;
  font-weight: 700;
  color: #64748b;
}
.info-row dd {
  margin: 0;
  flex: 1;
  word-break: break-all;
}
.field {
  margin-bottom: 0.75rem;
}
.field label {
  display: block;
  font-size: 0.75rem;
  font-weight: 700;
  color: #4b5563;
  margin-bottom: 0.25rem;
}
.field input,
.field select {
  width: 100%;
  max-width: 20rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  padding: 0.5rem;
  font-size: 0.875rem;
}
.pw-form {
  max-width: 20rem;
}
.btn-save {
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 0.5rem;
  padding: 0.45rem 0.85rem;
  font-size: 0.8125rem;
  font-weight: 700;
  cursor: pointer;
}
.btn-save:disabled {
  opacity: 0.7;
  cursor: wait;
}
.badge {
  display: inline-block;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
}
.badge.ok {
  background: #dcfce7;
  color: #166534;
}
.ok {
  color: #15803d;
  font-size: 0.8125rem;
  margin: 0.35rem 0 0;
}
.error {
  color: #dc2626;
  font-size: 0.8125rem;
  margin: 0.35rem 0 0;
}
.caps-lock-hint {
  margin: 0 0 0.75rem;
  font-size: 0.8125rem;
  color: #d97706;
  font-weight: 600;
}
code {
  font-size: 0.8em;
  background: #f1f5f9;
  padding: 0.1rem 0.35rem;
  border-radius: 0.25rem;
}
</style>
