<template>
  <div class="panel">
    <div class="panel-head">
      <h2>客戶 Project 列表</h2>
      <button type="button" class="btn-refresh" :disabled="loading" @click="load">
        {{ loading ? '載入中…' : '🔄 重新整理' }}
      </button>
    </div>

    <p v-if="loading && !tenants.length" class="muted">⏳ 載入中...</p>
    <p v-else-if="error" class="error">{{ error }}</p>

    <div v-else-if="!tenants.length" class="empty">
      <p>尚未建立任何 Project。</p>
      <RouterLink to="/super/tenants/new" class="link">建立第一個 →</RouterLink>
    </div>

    <table v-else class="table">
      <thead>
        <tr>
          <th>Slug</th>
          <th>新人</th>
          <th>場地</th>
          <th>婚期</th>
          <th>最後修改</th>
          <th>狀態</th>
          <th class="actions-col">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="t in tenants"
          :key="t.tenantId"
          class="row-click"
          @click="goDetail(t.slug)"
        >
          <td><code>{{ t.slug }}</code></td>
          <td>{{ t.meta.couple_names || '—' }}</td>
          <td>{{ venueLabel(t.meta) }}</td>
          <td>{{ t.meta.wedding_date || '—' }}</td>
          <td class="audit-cell">
            <span>{{ formatUpdated(t.meta) }}</span>
          </td>
          <td>
            <span class="badge" :class="t.meta.status || 'active'">{{ t.meta.status || 'active' }}</span>
          </td>
          <td class="actions-cell" @click.stop>
            <div class="actions-wrap">
              <button
                type="button"
                class="btn-actions"
                :class="{ open: openMenuSlug === t.slug }"
                aria-haspopup="menu"
                :aria-expanded="openMenuSlug === t.slug"
                @click="toggleMenu(t.slug)"
              >
                ⋮
              </button>
              <div
                v-if="openMenuSlug === t.slug"
                class="actions-menu"
                role="menu"
                @click.stop
              >
                <a
                  :href="appUrl(`p/${t.slug}`)"
                  target="_blank"
                  rel="noopener"
                  role="menuitem"
                  @click="closeMenu"
                >
                  開啟點名頁
                </a>
                <a
                  :href="appUrl(`p/${t.slug}/admin`)"
                  target="_blank"
                  rel="noopener"
                  role="menuitem"
                  @click="closeMenu"
                >
                  開啟後台
                </a>
                <button type="button" role="menuitem" @click="goCopy(t)">
                  複製 Project
                </button>
                <button type="button" role="menuitem" class="danger" @click="openDelete(t)">
                  刪除 Project
                </button>
              </div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <p v-if="toast" class="toast" role="status">{{ toast }}</p>

    <div
      v-if="deleteTarget"
      class="modal-overlay"
      @click.self="closeDelete"
    >
      <div class="modal">
        <h3>🗑️ 刪除 Project</h3>
        <p class="modal-hint">
          將永久刪除 <code>{{ deleteTarget.slug }}</code> 及所有賓客、排位資料，無法復原。
        </p>
        <form @submit.prevent="confirmDelete">
          <div class="field">
            <label for="delete-pw">輸入你的登入密碼以確認</label>
            <input
              id="delete-pw"
              v-model="deletePassword"
              type="password"
              required
              autocomplete="current-password"
              :disabled="deleting"
            />
          </div>
          <p v-if="deleteMsg" :class="deleteMsgOk ? 'ok' : 'error'">{{ deleteMsg }}</p>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" :disabled="deleting" @click="closeDelete">
              取消
            </button>
            <button type="submit" class="btn-danger" :disabled="deleting || !deletePassword">
              {{ deleting ? '刪除中…' : '確認刪除' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '@/composables/useAuth';
import { listTenants, deleteTenant, formatAuditTime } from '@/composables/useSuperTenants';
import { appUrl } from '@/lib/appBase';

const router = useRouter();
const { verifyPassword } = useAuth();
const tenants = ref([]);
const loading = ref(true);
const error = ref('');
const openMenuSlug = ref(null);
const toast = ref('');
const deleteTarget = ref(null);
const deletePassword = ref('');
const deleting = ref(false);
const deleteMsg = ref('');
const deleteMsgOk = ref(false);

let toastTimer = null;

function venueLabel(meta) {
  const parts = [meta.venue_name, meta.venue_hall].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
}

function formatUpdated(meta) {
  const who = meta.updated_by_email || meta.created_by_email || '';
  const when = formatAuditTime(meta.updated_at || meta.created_at);
  return who ? `${when} · ${who}` : when;
}

function goDetail(slug) {
  router.push(`/super/tenants/${slug}`);
}

function toggleMenu(slug) {
  openMenuSlug.value = openMenuSlug.value === slug ? null : slug;
}

function closeMenu() {
  openMenuSlug.value = null;
}

function showToast(message) {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = '';
  }, 2000);
}

function goCopy(tenant) {
  closeMenu();
  router.push({ path: '/super/tenants/new', query: { copy: tenant.slug } });
}

function openDelete(tenant) {
  closeMenu();
  deleteTarget.value = tenant;
  deletePassword.value = '';
  deleteMsg.value = '';
  deleteMsgOk.value = false;
}

function closeDelete() {
  if (deleting.value) return;
  deleteTarget.value = null;
  deletePassword.value = '';
  deleteMsg.value = '';
}

function deleteErrorMessage(e) {
  const code = e?.code || '';
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return '密碼錯誤';
  }
  return e?.message || '刪除失敗';
}

async function confirmDelete() {
  if (!deleteTarget.value) return;
  deleteMsg.value = '';
  deleteMsgOk.value = false;
  deleting.value = true;
  try {
    await verifyPassword(deletePassword.value);
    await deleteTenant(deleteTarget.value.slug, deleteTarget.value.tenantId);
    tenants.value = tenants.value.filter((t) => t.tenantId !== deleteTarget.value.tenantId);
    closeDelete();
    showToast('已刪除 Project');
  } catch (e) {
    deleteMsgOk.value = false;
    deleteMsg.value = deleteErrorMessage(e);
  } finally {
    deleting.value = false;
  }
}

function onDocumentClick() {
  closeMenu();
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    tenants.value = await listTenants();
  } catch (e) {
    error.value = e?.message || '載入失敗';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  load();
  document.addEventListener('click', onDocumentClick);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
  clearTimeout(toastTimer);
});

defineExpose({ load });
</script>

<style scoped>
.panel {
  background: #fff;
  border-radius: 0.75rem;
  border: 1px solid #e2e8f0;
  padding: 1.25rem;
  position: relative;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.panel-head h2 {
  margin: 0;
  font-size: 1.125rem;
}
.btn-refresh {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.35rem 0.65rem;
  border-radius: 0.5rem;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  cursor: pointer;
}
.btn-refresh:disabled {
  opacity: 0.6;
  cursor: wait;
}
.muted {
  color: #94a3b8;
}
.error {
  color: #dc2626;
  font-size: 0.875rem;
}
.empty {
  text-align: center;
  padding: 2rem;
  color: #64748b;
}
.link {
  color: #2563eb;
  font-weight: 700;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.table th,
.table td {
  border-bottom: 1px solid #e2e8f0;
  padding: 0.5rem 0.4rem;
  text-align: left;
  vertical-align: middle;
}
.table th {
  font-size: 0.75rem;
  color: #64748b;
}
.actions-col {
  width: 4rem;
  text-align: center;
}
.audit-cell {
  font-size: 0.75rem;
  color: #64748b;
  max-width: 11rem;
}
.row-click {
  cursor: pointer;
}
.row-click:hover {
  background: #f8fafc;
}
.actions-cell {
  text-align: center;
  width: 4rem;
}
.actions-wrap {
  position: relative;
  display: inline-flex;
  justify-content: center;
  align-items: center;
}
.btn-actions {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border: 1px solid #cbd5e1;
  border-radius: 0.375rem;
  background: #f8fafc;
  color: #475569;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}
.btn-actions:hover,
.btn-actions.open {
  background: #e2e8f0;
  border-color: #94a3b8;
}
.actions-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  min-width: 9.5rem;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.1);
  z-index: 50;
  overflow: hidden;
}
.actions-menu a,
.actions-menu button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.45rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #374151;
  background: transparent;
  border: none;
  cursor: pointer;
  text-decoration: none;
}
.actions-menu a:hover,
.actions-menu button:hover {
  background: #f1f5f9;
}
.actions-menu .danger {
  color: #dc2626;
  border-top: 1px solid #e2e8f0;
}
.actions-menu .danger:hover {
  background: #fee2e2;
}
.badge {
  display: inline-block;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  background: #dcfce7;
  color: #166534;
}
.badge.expired {
  background: #fee2e2;
  color: #991b1b;
}
code {
  font-size: 0.8em;
}
.toast {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  padding: 0.5rem 1rem;
  background: #1e293b;
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 600;
  border-radius: 0.5rem;
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.15);
  z-index: 100;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 200;
}
.modal {
  background: #fff;
  border-radius: 0.75rem;
  border: 1px solid #e2e8f0;
  padding: 1.25rem;
  width: 100%;
  max-width: 22rem;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.12);
}
.modal h3 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
}
.modal-hint {
  margin: 0 0 1rem;
  font-size: 0.8125rem;
  color: #64748b;
  line-height: 1.5;
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
.field input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  padding: 0.5rem;
  font-size: 0.875rem;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.btn-cancel {
  padding: 0.45rem 0.85rem;
  border-radius: 0.5rem;
  border: 1px solid #d1d5db;
  background: #f8fafc;
  font-size: 0.8125rem;
  font-weight: 700;
  cursor: pointer;
}
.btn-danger {
  padding: 0.45rem 0.85rem;
  border-radius: 0.5rem;
  border: none;
  background: #dc2626;
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 700;
  cursor: pointer;
}
.btn-danger:disabled,
.btn-cancel:disabled {
  opacity: 0.6;
  cursor: wait;
}
.ok {
  color: #15803d;
  font-size: 0.8125rem;
  margin: 0;
}
</style>
