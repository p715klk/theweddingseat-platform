<template>
  <div class="admin-page bg-gray-100 text-gray-800 font-sans min-h-screen flex flex-col p-4">
    <!-- Auth 初始化中 -->
    <div
      v-if="!authReady"
      class="min-h-screen flex items-center justify-center text-gray-400 font-bold"
    >
      ⏳ 驗證登入狀態...
    </div>

    <!-- 未登入 -->
    <div
      v-else-if="!user"
      class="fixed inset-0 bg-gray-100 z-[10000] flex items-center justify-center p-4"
    >
      <AdminLoginForm @success="onLoggedIn" />
    </div>

    <!-- Tenant 錯誤 -->
    <TenantErrorView v-else-if="tenantError" :message="tenantError" />

    <!-- 已登入後台 -->
    <template v-else>
      <div
        v-if="isExpired"
        class="mb-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-xs font-bold"
      >
        ⚠️ 此專案已設為 expired — 公開點名已停用，後台仍可編輯賓客。
      </div>
      <header class="flex flex-wrap justify-between items-center border-b border-gray-300 pb-3 gap-3 mb-3">
        <div>
          <h1 class="text-xl font-bold text-red-700">📋 賓客名單管理後台</h1>
          <p class="text-xs text-gray-500">{{ coupleNames }} · {{ slug }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold"
            @click="addGuest"
          >
            ➕ 新增賓客
          </button>
          <button
            type="button"
            class="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold"
            :class="{ 'ring-2 ring-yellow-400': dirty }"
            @click="save"
          >
            💾 儲存變更
          </button>
          <RouterLink
            :to="`/p/${slug}/seating`"
            class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold"
          >
            🦢 畫布排位
          </RouterLink>
          <RouterLink
            :to="`/p/${slug}`"
            class="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold"
          >
            🏠 點名頁
          </RouterLink>
          <button
            type="button"
            class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold border"
            @click="handleLogout"
          >
            登出
          </button>
        </div>
      </header>

      <div v-if="loading" class="text-center py-12 text-gray-400 font-bold">⏳ 載入中...</div>

      <div v-else class="bg-white rounded-xl shadow border overflow-auto flex-1">
        <table class="w-full text-left text-sm min-w-[900px]">
          <thead class="bg-gray-50 sticky top-0 border-b">
            <tr>
              <th class="p-2">#</th>
              <th class="p-2">桌號</th>
              <th class="p-2">座位</th>
              <th class="p-2">姓名</th>
              <th class="p-2">來源</th>
              <th class="p-2">標籤</th>
              <th class="p-2">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!guests.length">
              <td colspan="7" class="text-center py-8 text-gray-400">尚無賓客，請按「新增賓客」</td>
            </tr>
            <tr
              v-for="(g, i) in guests"
              :key="i"
              class="border-b hover:bg-gray-50"
              :class="{ 'bg-red-50/40': g.isCanceled }"
            >
              <td class="p-2 text-gray-400 font-mono">{{ i + 1 }}</td>
              <td class="p-2">
                <input
                  v-model.number="g.table"
                  type="number"
                  min="1"
                  class="w-16 border rounded p-1"
                  placeholder="—"
                  @input="markDirty"
                />
              </td>
              <td class="p-2">
                <input
                  v-model.number="g.sort"
                  type="number"
                  min="1"
                  class="w-16 border rounded p-1"
                  :disabled="!g.table"
                  @input="markDirty"
                />
              </td>
              <td class="p-2">
                <input v-model="g.name" type="text" class="w-full border rounded p-1 font-bold" @input="markDirty" />
              </td>
              <td class="p-2">
                <select v-model="g.side" class="border rounded p-1 font-bold" @change="markDirty">
                  <option value="男方">男方</option>
                  <option value="女方">女方</option>
                </select>
              </td>
              <td class="p-2">
                <input
                  :value="(g.group || []).join('|')"
                  type="text"
                  class="w-full border rounded p-1 text-xs"
                  placeholder="標籤用 | 分隔"
                  @input="(e) => { g.group = e.target.value.split('|').map((t) => t.trim()).filter(Boolean); markDirty(); }"
                />
              </td>
              <td class="p-2">
                <button type="button" class="text-red-500 font-bold" @click="removeGuest(i)">刪除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { useTenant } from '@/composables/useTenant';
import { useAuth } from '@/composables/useAuth';
import { useAdminGuests } from '@/composables/useAdminGuests';
import AdminLoginForm from '@/components/auth/AdminLoginForm.vue';
import TenantErrorView from '@/views/TenantErrorView.vue';

const route = useRoute();
const tenantReady = ref(false);
const adminBooted = ref(false);

const { slug, coupleNames, error: tenantError, isExpired, initTenant } = useTenant();
const { user, authReady, logout } = useAuth();
const {
  guests,
  dirty,
  loading,
  load,
  save,
  addGuest,
  removeGuest,
  markDirty,
  startSync,
  stopSync,
} = useAdminGuests();

onMounted(async () => {
  await initTenant(route, { allowExpired: true });
  tenantReady.value = true;
});

watch(
  [user, authReady, tenantReady, tenantError],
  async ([u, ready, tReady, tErr]) => {
    if (!ready || !tReady || tErr) return;
    if (u && !adminBooted.value) {
      await bootAdmin();
    }
    if (!u) {
      adminBooted.value = false;
      stopSync();
    }
  },
  { immediate: true },
);

async function onLoggedIn() {
  if (user.value && !adminBooted.value) {
    await bootAdmin();
  }
}

async function bootAdmin() {
  adminBooted.value = true;
  await load();
  startSync();
}

async function handleLogout() {
  stopSync();
  adminBooted.value = false;
  await logout();
}

onUnmounted(() => {
  stopSync();
  adminBooted.value = false;
});
</script>
