<template>
  <div class="panel">
    <h2>Members 管理</h2>
    <p class="hint-block">
      每列代表一個專案成員（<code>tenant_members</code>）。同一 email 若加入多個 project 會出現多列，各自可有唔同顯示名稱。
      可修改顯示名稱、重設登入密碼（全帳號），或移除該專案成員。
    </p>

    <div class="toolbar">
      <input v-model="q" type="text" class="search" placeholder="搜尋：email / slug / uid / 角色" />
      <button type="button" class="btn" :disabled="loading" @click="loadAll">
        {{ loading ? '載入中…' : '重新載入' }}
      </button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="loading" class="muted">⏳ 載入 members…</div>
    <p v-else-if="!filteredRows.length" class="muted">無資料</p>

    <ul v-else class="list">
      <li v-for="row in filteredRows" :key="row.key" class="item">
        <div class="top">
          <div class="title-block">
            <div class="title">
              <div class="title-identity">
                <strong>{{ row.displayName || row.email || row.uid }}</strong>
                <span v-if="row.displayName && row.email" class="email-sub">{{ row.email }}</span>
              </div>
              <span class="title-sep" aria-hidden="true">·</span>
              <div class="title-context">
                <span class="project-tag">Project:&nbsp<code>{{ row.slug }}</code></span>
                <span class="role-badge" :class="`role-${row.role}`">{{ row.roleLabel }}</span>
              </div>
              <span class="title-sep" aria-hidden="true">·</span>
              <span class="uid-tag">UID <code>{{ row.uid }}</code></span>
            </div>
          </div>
          <button
            v-if="row.role !== 'owner'"
            type="button"
            class="btn danger"
            :disabled="busyKey.startsWith(row.key)"
            @click="remove(row)"
          >
            {{ busyKey === `${row.key}:remove` ? '移除中…' : '移除 members' }}
          </button>
          <span v-else class="owner-hint">Owner 不可在此移除</span>
        </div>

        <div class="body-grid">
          <div class="field-row">
            <label>顯示名稱</label>
            <div class="field-control">
              <input v-model="row.editDisplayName" type="text" class="input-compact" placeholder="(選填)" />
              <button
                type="button"
                class="btn"
                :disabled="busyKey === `${row.key}:save`"
                @click="save(row)"
              >
                {{ busyKey === `${row.key}:save` ? '儲存中…' : '儲存名稱' }}
              </button>
              <span v-if="row.msgKind === 'name' && row.msg" :class="row.msgOk ? 'ok' : 'error'">{{ row.msg }}</span>
            </div>
          </div>
          <div class="field-row">
            <label>重設密碼</label>
            <div class="field-control">
              <input
                v-model="row.resetPassword"
                type="text"
                class="input-compact"
                minlength="6"
                autocomplete="new-password"
                placeholder="至少 6 個字元"
              />
              <button type="button" class="btn" @click="generatePassword(row)">隨機</button>
              <button
                type="button"
                class="btn primary"
                :disabled="busyKey === `${row.key}:reset`"
                @click="resetPassword(row)"
              >
                {{ busyKey === `${row.key}:reset` ? '重設中…' : '重設' }}
              </button>
              <span v-if="row.msgKind === 'reset' && row.msg" :class="row.msgOk ? 'ok' : 'error'">{{ row.msg }}</span>
            </div>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { usePlatformAdmin } from '@/composables/usePlatformAdmin';
import {
  listAllProjectMembers,
  removeProjectMember,
  resetProjectMemberPassword,
  updateProjectMemberProfile,
} from '@/composables/useSuperMembers';

const { isPlatformAdmin } = usePlatformAdmin();

const q = ref('');
const loading = ref(false);
const error = ref('');
const busyKey = ref('');
const rows = ref([]);

async function loadAll() {
  error.value = '';
  rows.value = [];
  if (!isPlatformAdmin.value) {
    error.value = '此帳號未設為 platform admin';
    return;
  }
  loading.value = true;
  try {
    const list = await listAllProjectMembers();
    rows.value = list.map((row) => ({
      ...row,
      editDisplayName: row.displayName || '',
      resetPassword: '',
      msg: '',
      msgKind: '',
      msgOk: true,
    }));
  } catch (e) {
    error.value = e?.message || '載入失敗';
  } finally {
    loading.value = false;
  }
}

const filteredRows = computed(() => {
  const s = q.value.trim().toLowerCase();
  if (!s) return rows.value;
  return rows.value.filter((r) => {
    return (
      String(r.slug || '').toLowerCase().includes(s) ||
      String(r.email || '').toLowerCase().includes(s) ||
      String(r.uid || '').toLowerCase().includes(s) ||
      String(r.role || '').toLowerCase().includes(s) ||
      String(r.roleLabel || '').toLowerCase().includes(s)
    );
  });
});

function generatePassword(row) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < 12; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  row.resetPassword = out;
}

async function save(row) {
  row.msg = '';
  row.msgKind = 'name';
  busyKey.value = `${row.key}:save`;
  try {
    await updateProjectMemberProfile(row.tenantId, row.uid, {
      display_name: row.editDisplayName || '',
    });
    row.displayName = row.editDisplayName;
    row.msgOk = true;
    row.msg = '已儲存';
  } catch (e) {
    row.msgOk = false;
    row.msg = e?.message || '儲存失敗';
  } finally {
    busyKey.value = '';
  }
}

async function resetPassword(row) {
  const pw = String(row.resetPassword || '').trim();
  if (pw.length < 6) {
    row.msgKind = 'reset';
    row.msgOk = false;
    row.msg = '密碼至少需要 6 個字元';
    return;
  }
  const ok = window.confirm(
    `確定重設登入密碼？\n\nUser: ${row.email || row.uid}\nProject: ${row.slug}`,
  );
  if (!ok) return;

  row.msg = '';
  row.msgKind = 'reset';
  busyKey.value = `${row.key}:reset`;
  try {
    await resetProjectMemberPassword(row.uid, pw);
    row.msgOk = true;
    row.msg = '已重設密碼';
  } catch (e) {
    row.msgOk = false;
    row.msg = e?.message || '重設密碼失敗';
  } finally {
    busyKey.value = '';
  }
}

async function remove(row) {
  const ok = window.confirm(
    `確定移除 members？\n\nProject: ${row.slug}\nUser: ${row.email || row.uid}\n\n若該帳號沒有加入其他專案，登入帳號亦會一併刪除。`,
  );
  if (!ok) return;
  row.msg = '';
  row.msgKind = 'remove';
  busyKey.value = `${row.key}:remove`;
  try {
    const result = await removeProjectMember(row.tenantId, row.uid);
    rows.value = rows.value.filter((r) => r.key !== row.key);
    if (result?.authDeleted) {
      row.msgOk = true;
      row.msg = '已移除並刪除登入帳號';
    }
  } catch (e) {
    row.msgOk = false;
    row.msg = e?.message || '移除失敗';
  } finally {
    busyKey.value = '';
  }
}

onMounted(loadAll);
</script>

<style scoped>
.panel {
  background: #fff;
  border-radius: 0.75rem;
  border: 1px solid #e2e8f0;
  padding: 1.25rem;
}
.hint-block {
  font-size: 0.8rem;
  color: #64748b;
  margin: 0.5rem 0 1rem;
  line-height: 1.5;
}
.toolbar {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.75rem;
}
.search {
  flex: 1;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  padding: 0.45rem 0.6rem;
  font-size: 0.875rem;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.item {
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  padding: 0.85rem 0.95rem;
}
.top {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 0.65rem;
  padding-bottom: 0.65rem;
  border-bottom: 1px solid #f1f5f9;
}
.title-block {
  min-width: 0;
  flex: 1;
}
.title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.55rem;
  min-width: 0;
  line-height: 1.45;
}
.title-identity {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.5rem;
  min-width: 0;
}
.title-context {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
.title-sep {
  color: #cbd5e1;
  font-weight: 700;
  user-select: none;
  line-height: 1;
}
.title strong {
  font-size: 1.0625rem;
  color: #0f172a;
}
.email-sub {
  font-size: 0.9375rem;
  color: #64748b;
}
.project-tag {
  display: inline-flex;
  align-items: center;
  padding: 0.12rem 0.55rem;
  border-radius: 999px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  font-size: 0.875rem;
  font-weight: 600;
  color: #475569;
}
.project-tag code {
  background: transparent;
  padding: 0;
  font-size: inherit;
  color: inherit;
}
.uid-tag {
  font-size: 0.875rem;
  color: #94a3b8;
  white-space: nowrap;
}
.uid-tag code {
  color: #64748b;
}
.role-badge {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 700;
  white-space: nowrap;
}
.role-owner {
  background: #fef3c7;
  color: #92400e;
}
.role-admin {
  background: #dbeafe;
  color: #1d4ed8;
}
.role-reception {
  background: #f3e8ff;
  color: #7c3aed;
}
.owner-hint {
  flex-shrink: 0;
  font-size: 0.9375rem;
  color: #94a3b8;
  white-space: nowrap;
}
.body-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.55rem 1rem;
}
@media (max-width: 900px) {
  .title-sep {
    display: none;
  }
  .title {
    row-gap: 0.35rem;
  }
}
@media (max-width: 768px) {
  .body-grid {
    grid-template-columns: 1fr;
  }
}
.field-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}
.field-row label {
  flex: 0 0 5.25rem;
  text-align: left;
  font-size: 0.9375rem;
  font-weight: 700;
  color: #475569;
  line-height: 1.3;
}
.field-control {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.input-compact {
  flex: 1;
  min-width: 0;
  border: 1px solid #cbd5e1;
  border-radius: 0.375rem;
  padding: 0.45rem 0.6rem;
  font-size: 1rem;
  line-height: 1.4;
  color: #1e293b;
  background: #fff;
}
.input-compact::placeholder {
  color: #94a3b8;
}
.btn {
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #334155;
  font-weight: 700;
  font-size: 0.875rem;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.btn.primary {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}
.btn.danger {
  background: #fef2f2;
  color: #991b1b;
  border-color: #fecaca;
  padding: 0.45rem 0.7rem;
  font-size: 0.875rem;
}
.btn:disabled {
  opacity: 0.7;
  cursor: default;
}
.muted {
  color: #94a3b8;
  font-weight: 700;
}
.ok {
  font-size: 0.875rem;
  color: #166534;
  flex-shrink: 0;
}
.error {
  font-size: 0.875rem;
  color: #dc2626;
  flex-shrink: 0;
}
code {
  font-size: 0.92em;
  background: #f1f5f9;
  padding: 0.05rem 0.25rem;
  border-radius: 0.2rem;
}
</style>
