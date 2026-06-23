<template>
  <div class="panel">
    <h2>Members 管理</h2>
    <p class="hint-block">
      顯示所有 Project 嘅 members（以 <code>tenants/*/members</code> + <code>user_profiles</code> 組合）。
      可修改顯示名稱／初始密碼（只係你系統記錄，唔會改 Auth 密碼），或移除 members 權限；若該帳號無其他專案 membership，會一併刪除登入帳號。
    </p>

    <div class="toolbar">
      <input v-model="q" type="text" class="search" placeholder="搜尋：email / slug / uid" />
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
          <div class="title">
            <strong>{{ row.email || row.uid }}</strong>
            <span class="sub">
              · Project: <code>{{ row.slug }}</code>
            </span>
          </div>
          <button
            type="button"
            class="btn danger"
            :disabled="busyKey === row.key"
            @click="remove(row)"
          >
            {{ busyKey === row.key ? '移除中…' : '移除 members' }}
          </button>
        </div>

        <div class="grid">
          <div class="field">
            <label>UID</label>
            <input :value="row.uid" type="text" readonly />
          </div>
          <div class="field">
            <label>Email</label>
            <input :value="row.email || ''" type="text" readonly />
          </div>
        </div>

        <div class="grid">
          <div class="field">
            <label>顯示名稱</label>
            <input v-model="row.editDisplayName" type="text" placeholder="(選填)" />
          </div>
          <div class="field">
            <label>初始密碼（記錄）</label>
            <div class="pw-row">
              <input v-model="row.editInitialPassword" type="text" placeholder="(選填)" />
              <button type="button" class="btn" @click="row.pwVisible = !row.pwVisible">
                {{ row.pwVisible ? '隱藏' : '顯示' }}
              </button>
            </div>
            <p v-if="row.editInitialPassword" class="pw-preview">
              目前：<code>{{ row.pwVisible ? row.editInitialPassword : '********' }}</code>
            </p>
          </div>
        </div>

        <div class="actions">
          <button type="button" class="btn primary" :disabled="busyKey === row.key" @click="save(row)">
            {{ busyKey === row.key ? '儲存中…' : '儲存修改' }}
          </button>
          <span v-if="row.msg" :class="row.msgOk ? 'ok' : 'error'">{{ row.msg }}</span>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { ref as dbRef, get } from '@/rtdb';
import { database } from '@/firebase';
import { useAuth } from '@/composables/useAuth';
import { usePlatformAdmin } from '@/composables/usePlatformAdmin';
import { setTenantMemberProfile, removeTenantMember } from '@/composables/useSuperTenants';

const { user } = useAuth();
const { isPlatformAdmin } = usePlatformAdmin();

const q = ref('');
const loading = ref(false);
const error = ref('');
const busyKey = ref('');
const rows = ref([]);

function editorInfo() {
  if (!user.value) return null;
  return { uid: user.value.uid, email: user.value.email || '' };
}

async function loadAll() {
  error.value = '';
  rows.value = [];
  if (!isPlatformAdmin.value) {
    error.value = '此帳號未列入 platform_admins';
    return;
  }
  loading.value = true;
  try {
    const slugsSnap = await get(dbRef(database, 'slugs'));
    const slugs = slugsSnap.val() || {};

    const out = [];
    for (const [slug, tenantIdRaw] of Object.entries(slugs)) {
      const tenantId = String(tenantIdRaw);
      const [membersSnap, profilesSnap] = await Promise.all([
        get(dbRef(database, `tenants/${tenantId}/members`)),
        get(dbRef(database, `tenants/${tenantId}/user_profiles`)),
      ]);
      const members = membersSnap.val() || {};
      const profiles = profilesSnap.val() || {};

      Object.entries(members).forEach(([uid, roleVal]) => {
        const role = roleVal === true ? 'admin' : roleVal;
        if (role !== 'admin' && role !== 'reception') return;
        const p = profiles?.[uid] || {};
        out.push({
          key: `${tenantId}:${uid}`,
          tenantId,
          slug,
          uid,
          email: p.email || '',
          displayName: p.display_name || '',
          initialPassword: p.initial_password || '',
          editDisplayName: p.display_name || '',
          editInitialPassword: p.initial_password || '',
          pwVisible: false,
          msg: '',
          msgOk: true,
        });
      });
    }
    rows.value = out.sort((a, b) => (a.slug || '').localeCompare(b.slug || '') || (a.email || '').localeCompare(b.email || ''));
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
      String(r.uid || '').toLowerCase().includes(s)
    );
  });
});

async function save(row) {
  row.msg = '';
  busyKey.value = row.key;
  try {
    await setTenantMemberProfile(
      row.tenantId,
      row.uid,
      {
        display_name: row.editDisplayName || '',
        initial_password: row.editInitialPassword || '',
      },
      editorInfo(),
    );
    row.msgOk = true;
    row.msg = '已儲存';
  } catch (e) {
    row.msgOk = false;
    row.msg = e?.message || '儲存失敗';
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
  busyKey.value = row.key;
  try {
    const result = await removeTenantMember(row.tenantId, row.uid);
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

loadAll();
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
  gap: 0.75rem;
}
.item {
  border: 1px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 0.85rem;
}
.top {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 0.65rem;
}
.title strong {
  font-size: 0.95rem;
}
.sub {
  color: #64748b;
  font-size: 0.75rem;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
  margin-top: 0.65rem;
}
@media (max-width: 640px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
.field label {
  display: block;
  font-size: 0.75rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
  color: #475569;
}
.field input {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  padding: 0.45rem 0.6rem;
  font-size: 0.875rem;
}
.pw-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.pw-row input {
  flex: 1;
}
.pw-preview {
  margin: 0.35rem 0 0;
  font-size: 0.75rem;
  color: #64748b;
}
.actions {
  margin-top: 0.75rem;
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}
.btn {
  padding: 0.45rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #334155;
  font-weight: 800;
  font-size: 0.75rem;
  cursor: pointer;
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
  color: #166534;
  font-size: 0.8rem;
}
.error {
  color: #dc2626;
  font-size: 0.8rem;
}
code {
  font-size: 0.85em;
  background: #f1f5f9;
  padding: 0.1rem 0.3rem;
  border-radius: 0.2rem;
}
</style>

