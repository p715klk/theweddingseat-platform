<template>
  <div class="panel">
    <h2>Super Admin 管理</h2>
    <p class="hint-block">
      管理平台營運帳號（<code>is_platform_admin</code>）。新增後對方可登入 <code>/super</code>。
    </p>

    <section class="section">
      <h3>現有 Super Admin</h3>
      <div class="toolbar">
        <button type="button" class="btn" :disabled="loading" @click="loadAll">
          {{ loading ? '載入中…' : '重新載入' }}
        </button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <div v-if="loading" class="muted">⏳ 載入中…</div>
      <p v-else-if="!rows.length" class="muted">尚未設定 Super Admin</p>
      <ul v-else class="list">
        <li v-for="row in rows" :key="row.uid" class="item">
          <div class="top">
            <div class="title">
              <strong>{{ row.email || row.uid }}</strong>
              <span v-if="row.displayName" class="sub">· {{ row.displayName }}</span>
              <span v-if="row.uid === user?.uid" class="badge self">你</span>
            </div>
            <button
              v-if="row.uid !== user?.uid"
              type="button"
              class="btn danger"
              :disabled="busyUid === row.uid"
              @click="remove(row)"
            >
              {{ busyUid === row.uid ? '移除中…' : '移除' }}
            </button>
          </div>
          <div class="meta">
            <span>UID：<code>{{ row.uid }}</code></span>
            <span v-if="row.createdByEmail">建立者：{{ row.createdByEmail }}</span>
          </div>
          <p v-if="row.initialPassword" class="pw-preview">
            初始密碼（記錄）：
            <code>{{ row.pwVisible ? row.initialPassword : '********' }}</code>
            <button type="button" class="btn" @click="row.pwVisible = !row.pwVisible">
              {{ row.pwVisible ? '隱藏' : '顯示' }}
            </button>
          </p>
          <p v-if="row.msg" :class="row.msgOk ? 'ok' : 'error'">{{ row.msg }}</p>
        </li>
      </ul>
    </section>

    <section class="section">
      <h3>新增 Super Admin</h3>
      <p class="hint-block">會建立登入帳號並設為 Super Admin（is_platform_admin）。</p>
      <div v-if="createdInfo" class="created-box">
        <p class="created-title">✅ 已新增 Super Admin</p>
        <ul class="created-list">
          <li>Email：<code>{{ createdInfo.email }}</code></li>
          <li>
            初始密碼：<code>{{ createdInfo.password }}</code>
            <button type="button" class="btn-copy" @click="copy(createdInfo.password)">複製</button>
          </li>
        </ul>
        <p class="field-hint">請即時複製交畀對方；建議首次登入後更改密碼。</p>
      </div>
      <form class="form" @submit.prevent="submit">
        <div class="grid">
          <div class="field">
            <label>Email <span class="req">*</span></label>
            <input
              v-model="form.email"
              type="email"
              required
              autocomplete="off"
              placeholder="admin@example.com"
              :disabled="saving"
            />
          </div>
          <div class="field">
            <label>初始密碼 <span class="req">*</span></label>
            <div class="pw-row">
              <input
                v-model="form.password"
                type="text"
                required
                minlength="6"
                autocomplete="new-password"
                placeholder="至少 6 個字元"
                :disabled="saving"
              />
              <button type="button" class="btn-generate" :disabled="saving" @click="generatePassword">
                生成
              </button>
            </div>
          </div>
        </div>
        <div class="field">
          <label>顯示名稱</label>
          <input v-model="form.displayName" type="text" placeholder="(選填)" :disabled="saving" />
        </div>
        <p v-if="formMsg" :class="formMsgOk ? 'ok' : 'error'">{{ formMsg }}</p>
        <button type="submit" class="btn primary" :disabled="saving">
          {{ saving ? '建立中…' : '➕ 新增 Super Admin' }}
        </button>
      </form>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useAuth } from '@/composables/useAuth';
import { usePlatformAdmin } from '@/composables/usePlatformAdmin';
import {
  createPlatformAdminUser,
  listPlatformAdmins,
  removePlatformAdmin,
} from '@/composables/usePlatformAdmins';

const { user } = useAuth();
const { isPlatformAdmin } = usePlatformAdmin();

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const formMsg = ref('');
const formMsgOk = ref(false);
const busyUid = ref('');
const rows = ref([]);
const createdInfo = ref(null);

const form = ref({
  email: '',
  password: '',
  displayName: '',
});

function editorInfo() {
  if (!user.value) return null;
  return { uid: user.value.uid, email: user.value.email || '' };
}

async function loadAll() {
  error.value = '';
  if (!isPlatformAdmin.value) {
    error.value = '此帳號未列入 platform_admins';
    return;
  }
  loading.value = true;
  try {
    const list = await listPlatformAdmins();
    rows.value = list.map((row) => ({ ...row, pwVisible: false, msg: '', msgOk: true }));
  } catch (e) {
    error.value = e?.message || '載入失敗';
  } finally {
    loading.value = false;
  }
}

async function submit() {
  formMsg.value = '';
  formMsgOk.value = false;
  createdInfo.value = null;
  saving.value = true;
  try {
    const result = await createPlatformAdminUser({
      email: form.value.email,
      password: form.value.password,
      displayName: form.value.displayName,
      editor: editorInfo(),
    });
    createdInfo.value = { email: result.email, password: result.password };
    formMsgOk.value = true;
    formMsg.value = '已新增 Super Admin';
    form.value.email = '';
    form.value.password = '';
    form.value.displayName = '';
    await loadAll();
  } catch (e) {
    formMsgOk.value = false;
    formMsg.value = e?.message || '建立失敗';
  } finally {
    saving.value = false;
  }
}

async function remove(row) {
  if (!window.confirm(`確定移除 Super Admin「${row.email || row.uid}」？`)) return;
  row.msg = '';
  busyUid.value = row.uid;
  try {
    await removePlatformAdmin({ uid: row.uid, editor: editorInfo() });
    row.msgOk = true;
    row.msg = '已移除';
    await loadAll();
  } catch (e) {
    row.msgOk = false;
    row.msg = e?.message || '移除失敗';
  } finally {
    busyUid.value = '';
  }
}

function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < 12; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  form.value.password = out;
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
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
h2 {
  margin: 0 0 0.5rem;
  font-size: 1.125rem;
}
.hint-block {
  margin: 0 0 1rem;
  font-size: 0.8125rem;
  color: #64748b;
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
  margin: 0 0 0.75rem;
  font-size: 0.9375rem;
}
.toolbar {
  margin-bottom: 0.75rem;
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
  border-radius: 0.5rem;
  padding: 0.75rem;
}
.top {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}
.title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
.sub {
  font-size: 0.8125rem;
  color: #64748b;
}
.badge.self {
  display: inline-block;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: 0.65rem;
  font-weight: 700;
  background: #dbeafe;
  color: #1d4ed8;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  font-size: 0.75rem;
  color: #64748b;
}
.pw-preview {
  margin: 0.5rem 0 0;
  font-size: 0.8125rem;
}
.form {
  max-width: 36rem;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 0.75rem;
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
.pw-row {
  display: flex;
  gap: 0.5rem;
}
.pw-row input {
  flex: 1;
}
.req {
  color: #dc2626;
}
.btn,
.btn-generate,
.btn-copy {
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #1e293b;
  border-radius: 0.5rem;
  padding: 0.4rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}
.btn.primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}
.btn.danger {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}
.btn:disabled,
.btn-generate:disabled,
.btn.primary:disabled {
  opacity: 0.7;
  cursor: wait;
}
.created-box {
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 0.5rem;
}
.created-title {
  margin: 0 0 0.5rem;
  font-weight: 700;
  color: #166534;
}
.created-list {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 0.875rem;
}
.field-hint {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  color: #64748b;
}
.muted {
  color: #94a3b8;
  font-size: 0.875rem;
}
.ok {
  color: #15803d;
  font-size: 0.8125rem;
}
.error {
  color: #dc2626;
  font-size: 0.8125rem;
}
code {
  font-size: 0.8em;
  background: #f1f5f9;
  padding: 0.1rem 0.35rem;
  border-radius: 0.25rem;
}
</style>
