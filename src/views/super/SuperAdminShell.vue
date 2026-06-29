<template>
  <div class="super-shell">
    <div v-if="!authReady || !platformAdminReady" class="super-center muted">
      ⏳ 驗證登入狀態...
    </div>

    <div v-else-if="!user" class="super-center">
      <p v-if="idleLogoutNotice" class="idle-notice">{{ idleLogoutNotice }}</p>
      <LoginForm
        title="平台 Super Admin"
        hint="僅限 platform admin 帳號"
        theme="super"
        @success="onLoggedIn"
      />
    </div>

    <div v-else-if="!isPlatformAdmin" class="super-center denied">
      <h2>無權限</h2>
      <p>此帳號未設為 platform admin。</p>
      <p class="hint">請確認你的帳號已設為 platform admin（PocketBase users.is_platform_admin）。</p>
      <button type="button" class="btn-denied-logout" @click="handleLogout">登出</button>
    </div>

    <template v-else>
      <header class="super-header">
        <div>
          <h1>🛠️ Super Admin</h1>
          <p class="subtitle">平台營運 · 管理客戶 Project</p>
        </div>
        <div class="header-actions">
          <RouterLink v-if="route.name !== 'super-tenants'" to="/super/tenants" class="btn-header">
            專案列表
          </RouterLink>
          <RouterLink to="/super/members" class="btn-header" :class="{ active: route.name === 'super-members' }">
            👥 Members
          </RouterLink>
          <RouterLink to="/super/admins" class="btn-header" :class="{ active: route.name === 'super-admins' }">
            🛡️ Admins
          </RouterLink>
          <RouterLink v-if="route.name !== 'super-tenant-new'" to="/super/tenants/new" class="btn-header primary">
            ➕ 新增 Project
          </RouterLink>
          <span v-if="user?.email" class="user-email">{{ user.email }}</span>
          <RouterLink
            to="/super/settings"
            class="btn-header"
            :class="{ active: route.name === 'super-settings' }"
          >
            ⚙️ 設定
          </RouterLink>
          <button type="button" class="btn-header" @click="handleLogout">登出</button>
        </div>
      </header>
      <main class="super-main">
        <RouterView />
      </main>
    </template>

    <AppFooter />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import LoginForm from '@/components/auth/LoginForm.vue';
import AppFooter from '@/components/AppFooter.vue';
import { useAuth } from '@/composables/useAuth';
import { usePlatformAdmin } from '@/composables/usePlatformAdmin';
import { useIdleLogout, consumeLogoutReason } from '@/composables/useIdleLogout';

const route = useRoute();
const { user, authReady, logout } = useAuth();
const { isPlatformAdmin, platformAdminReady } = usePlatformAdmin();

const idleLogoutNotice = ref('');

const idleLogoutEnabled = computed(
  () => authReady.value && platformAdminReady.value && !!user.value && isPlatformAdmin.value,
);
useIdleLogout(idleLogoutEnabled);

watch(
  user,
  (u) => {
    if (u) {
      idleLogoutNotice.value = '';
      return;
    }
    if (consumeLogoutReason() === 'idle') {
      idleLogoutNotice.value = '你已因閒置超時而自動登出，請重新登入。';
    }
  },
  { immediate: true },
);

function onLoggedIn() {
  /* usePlatformAdmin watch 會自動檢查 */
}

async function handleLogout() {
  await logout();
}
</script>

<style scoped>
.super-shell {
  min-height: 100vh;
  background: #f1f5f9;
  color: #1e293b;
  font-family: system-ui, sans-serif;
}
.super-center {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  gap: 0.75rem;
}
.super-center.denied {
  text-align: center;
}
.super-center.denied h2 {
  margin: 0;
  color: #b91c1c;
}
.super-center .hint {
  font-size: 0.875rem;
  color: #64748b;
}
.btn-denied-logout {
  padding: 0.4rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 700;
  border: 1px solid #cbd5e1;
  background: #e2e8f0;
  color: #1e293b;
  cursor: pointer;
}
.muted {
  color: #94a3b8;
  font-weight: 700;
}
.super-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  background: #1e3a8a;
  color: #fff;
}
.super-header h1 {
  margin: 0;
  font-size: 1.25rem;
}
.subtitle {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  opacity: 0.85;
}
.header-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.user-email {
  font-size: 0.75rem;
  opacity: 0.9;
  max-width: 14rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.btn-header {
  display: inline-block;
  padding: 0.4rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 700;
  text-decoration: none;
  border: none;
  cursor: pointer;
  background: rgb(255 255 255 / 0.15);
  color: #fff;
}
.btn-header:hover {
  background: rgb(255 255 255 / 0.25);
}
.btn-header.primary {
  background: #2563eb;
}
.btn-header.primary:hover {
  background: #1d4ed8;
}
.btn-header.active {
  background: rgb(255 255 255 / 0.3);
}
.idle-notice {
  margin: 0 0 0.75rem;
  padding: 0.65rem 1rem;
  max-width: 22rem;
  width: 100%;
  background: #fef3c7;
  color: #92400e;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  text-align: center;
}
.super-main {
  max-width: 56rem;
  margin: 0 auto;
  padding: 1.25rem;
}
code {
  background: #e2e8f0;
  padding: 0.1rem 0.35rem;
  border-radius: 0.25rem;
  font-size: 0.8em;
}
</style>
