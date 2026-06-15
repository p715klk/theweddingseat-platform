<template>
  <div class="super-shell">
    <div v-if="!authReady || !platformAdminReady" class="super-center muted">
      ⏳ 驗證登入狀態...
    </div>

    <div v-else-if="!user" class="super-center">
      <SuperAdminLoginForm @success="onLoggedIn" />
    </div>

    <div v-else-if="!isPlatformAdmin" class="super-center denied">
      <h2>無權限</h2>
      <p>此帳號未列入 <code>platform_admins</code>。</p>
      <p class="hint">請喺 Firebase Console → Realtime Database 加入你的 UID。</p>
      <button type="button" class="btn-secondary" @click="handleLogout">登出</button>
    </div>

    <template v-else>
      <header class="super-header">
        <div>
          <h1>🛠️ Super Admin</h1>
          <p class="subtitle">平台營運 · 管理客戶 Project</p>
        </div>
        <div class="header-actions">
          <RouterLink v-if="route.name !== 'super-tenants'" to="/super/tenants" class="btn-secondary">
            客戶列表
          </RouterLink>
          <RouterLink v-if="route.name !== 'super-tenant-new'" to="/super/tenants/new" class="btn-primary">
            ➕ 新增 Project
          </RouterLink>
          <button type="button" class="btn-secondary" @click="handleLogout">登出</button>
        </div>
      </header>
      <main class="super-main">
        <RouterView />
      </main>
    </template>
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router';
import SuperAdminLoginForm from '@/components/auth/SuperAdminLoginForm.vue';
import { useAuth } from '@/composables/useAuth';
import { usePlatformAdmin } from '@/composables/usePlatformAdmin';

const route = useRoute();
const { user, authReady, logout } = useAuth();
const { isPlatformAdmin, platformAdminReady } = usePlatformAdmin();

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
  gap: 0.5rem;
}
.super-main {
  max-width: 56rem;
  margin: 0 auto;
  padding: 1.25rem;
}
.btn-primary,
.btn-secondary {
  display: inline-block;
  padding: 0.4rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 700;
  text-decoration: none;
  border: none;
  cursor: pointer;
}
.btn-primary {
  background: #2563eb;
  color: #fff;
}
.btn-secondary {
  background: #e2e8f0;
  color: #1e293b;
}
code {
  background: #e2e8f0;
  padding: 0.1rem 0.35rem;
  border-radius: 0.25rem;
  font-size: 0.8em;
}
</style>
