<template>
  <div class="panel">
    <RouterLink to="/super/tenants" class="back">← 返回列表</RouterLink>

    <p v-if="loading" class="muted">⏳ 載入中...</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <p v-else-if="!tenant" class="error">找不到 Project「{{ slug }}」</p>

    <template v-else>
      <header class="head">
        <div>
          <h2>{{ tenant.meta.couple_names || slug }}</h2>
          <p class="sub"><code>{{ slug }}</code> · tenantId: <code>{{ tenant.tenantId }}</code></p>
        </div>
        <span class="badge" :class="tenant.meta.status || 'active'">
          {{ tenant.meta.status || 'active' }}
        </span>
      </header>

      <section class="section">
        <h3>連結（URL Slug）</h3>
        <p class="hint-block">
          改 slug 會改晒點名／後台網址。舊 link 會失效；資料仍保留喺 <code>tenants/{{ tenant.tenantId }}</code>。
        </p>
        <form class="slug-form" @submit.prevent="saveSlug">
          <div class="slug-row">
            <span class="slug-prefix">{{ appUrl('p/') }}</span>
            <input v-model="editForm.slug" type="text" required placeholder="chen-wong-20260915" />
          </div>
          <p class="field-hint">預覽：<code>{{ slugPreview || '…' }}</code></p>
          <p v-if="slugMsg" :class="slugMsgOk ? 'ok' : 'error'">{{ slugMsg }}</p>
          <button type="submit" class="btn-save" :disabled="savingSlug || slugPreview === slug">
            {{ savingSlug ? '更新中…' : '🔗 更新連結' }}
          </button>
        </form>
        <ul class="links">
          <li>
            點名頁：
            <a :href="checkInUrl" target="_blank" rel="noopener">{{ checkInUrl }}</a>
            <button type="button" class="btn-copy" @click="copy(checkInUrl)">複製</button>
          </li>
          <li>
            後台：
            <a :href="adminUrl" target="_blank" rel="noopener">{{ adminUrl }}</a>
            <button type="button" class="btn-copy" @click="copy(adminUrl)">複製</button>
          </li>
        </ul>
      </section>

      <section class="section">
        <h3>編輯 Project 資料</h3>
        <p class="hint-block">你係 platform admin，可以改晒以下資料（包括 expired 狀態嘅 project）。</p>
        <form class="edit-form" @submit.prevent="saveMeta">
          <div class="field">
            <label>新人姓名</label>
            <input v-model="editForm.coupleNames" type="text" required />
          </div>
          <div class="grid">
            <div class="field">
              <label>酒店</label>
              <input v-model="editForm.venueName" type="text" required />
            </div>
            <div class="field">
              <label>宴會廳</label>
              <input v-model="editForm.venueHall" type="text" />
            </div>
          </div>
          <div class="grid">
            <div class="field">
              <label>婚期</label>
              <input v-model="editForm.weddingDate" type="date" required />
            </div>
            <div class="field">
              <label>主題色</label>
              <input v-model="editForm.themeColor" type="color" />
            </div>
          </div>
          <div class="field">
            <label>Plan</label>
            <select v-model="editForm.plan">
              <option value="standard">standard</option>
              <option value="pro">pro</option>
              <option value="concierge">concierge</option>
            </select>
          </div>
          <p v-if="saveMetaMsg" :class="saveMetaOk ? 'ok' : 'error'">{{ saveMetaMsg }}</p>
          <button type="submit" class="btn-save" :disabled="savingMeta">
            {{ savingMeta ? '儲存中…' : '💾 儲存資料' }}
          </button>
        </form>
        <p class="meta-readonly">
          建立：{{ formatAuditTime(tenant.meta.created_at) }}
          <span v-if="tenant.meta.created_by_email"> · {{ tenant.meta.created_by_email }}</span>
        </p>
        <p class="meta-readonly">
          最後修改：{{ formatAuditTime(tenant.meta.updated_at) }}
          <span v-if="tenant.meta.updated_by_email"> · {{ tenant.meta.updated_by_email }}</span>
        </p>
      </section>

      <section class="section">
        <h3>後台權限（members）</h3>
        <p v-if="!memberUids.length" class="hint">尚未設定。客戶無法登入後台改賓客。</p>
        <ul v-else class="uid-list">
          <li v-for="uid in memberUids" :key="uid"><code>{{ uid }}</code></li>
        </ul>

        <form class="member-form" @submit.prevent="submitMember">
          <label>新增 Owner UID</label>
          <div class="member-row">
            <input v-model="newMemberUid" type="text" placeholder="Firebase Auth User UID" />
            <button type="submit" :disabled="savingMember">{{ savingMember ? '加入中…' : '加入' }}</button>
          </div>
          <p v-if="memberMsg" :class="memberMsgOk ? 'ok' : 'error'">{{ memberMsg }}</p>
        </form>
      </section>

      <section class="section">
        <h3>重設 Owner 密碼（平台管理員）</h3>
        <p class="hint-block">
          Owner：
          <span v-if="ownerEmail"><code>{{ ownerEmail }}</code></span>
          <span v-else><code>{{ pwUid || 'owner_uid' }}</code></span>
          （會直接更新 Firebase Auth 密碼；無需舊密碼）。
        </p>
        <form class="edit-form" @submit.prevent="resetOwnerPassword">
          <div class="field">
            <label>Owner UID（只讀）</label>
            <input v-model="pwUid" type="text" readonly />
          </div>
          <div class="grid">
            <div class="field">
              <label>新密碼</label>
              <input v-model="newPw" type="password" minlength="6" required autocomplete="new-password" />
            </div>
            <div class="field">
              <label>確認新密碼</label>
              <input v-model="confirmPw" type="password" minlength="6" required autocomplete="new-password" />
            </div>
          </div>
          <p v-if="pwMsg" :class="pwMsgOk ? 'ok' : 'error'">{{ pwMsg }}</p>
          <button type="submit" class="btn-save" :disabled="savingPw || !pwUid">
            {{ savingPw ? '更新中…' : '🔒 更新 Owner 密碼' }}
          </button>
        </form>
      </section>

      <section class="section">
        <h3>狀態</h3>
        <p class="hint-block">
          <strong>expired</strong> 只會停用<strong>公開點名</strong>（改唔到「已到／未到」）。
          你同客戶後台仍然可以改賓客名單。
        </p>
        <div class="status-row">
          <button
            type="button"
            class="btn-status"
            :disabled="tenant.meta.status === 'active'"
            @click="setStatus('active')"
          >
            設為 active
          </button>
          <button
            type="button"
            class="btn-status expired"
            :disabled="tenant.meta.status === 'expired'"
            @click="setStatus('expired')"
          >
            設為 expired（停用點名）
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '@/composables/useAuth';
import {
  getTenantBySlug,
  getTenantOwnerProfile,
  addTenantMember,
  setTenantStatus,
  updateTenantMeta,
  renameTenantSlug,
  normalizeSlug,
  formatAuditTime,
  setAuthUserPassword,
} from '@/composables/useSuperTenants';
import { appUrl } from '@/lib/appBase';

const route = useRoute();
const router = useRouter();
const { user } = useAuth();
const slug = computed(() => String(route.params.slug || ''));
const tenant = ref(null);
const loading = ref(true);
const error = ref('');
const newMemberUid = ref('');
const savingMember = ref(false);
const memberMsg = ref('');
const memberMsgOk = ref(false);
const savingMeta = ref(false);
const saveMetaMsg = ref('');
const saveMetaOk = ref(false);
const savingSlug = ref(false);
const slugMsg = ref('');
const slugMsgOk = ref(false);
const pwUid = ref('');
const ownerEmail = ref('');
const newPw = ref('');
const confirmPw = ref('');
const savingPw = ref(false);
const pwMsg = ref('');
const pwMsgOk = ref(false);

const editForm = reactive({
  slug: '',
  coupleNames: '',
  venueName: '',
  venueHall: '',
  weddingDate: '',
  themeColor: '#b91c1c',
  plan: 'standard',
});

const slugPreview = computed(() => normalizeSlug(editForm.slug));

function editorInfo() {
  if (!user.value) return null;
  return { uid: user.value.uid, email: user.value.email || '' };
}

function syncEditForm() {
  const m = tenant.value?.meta || {};
  editForm.slug = tenant.value?.slug || m.slug || '';
  editForm.coupleNames = m.couple_names || '';
  editForm.venueName = m.venue_name || '';
  editForm.venueHall = m.venue_hall || '';
  editForm.weddingDate = m.wedding_date || '';
  editForm.themeColor = m.theme_color || '#b91c1c';
  editForm.plan = m.plan || 'standard';
  pwUid.value = m.owner_uid || '';
}

const checkInUrl = computed(() => appUrl(`p/${slug.value}`));
const adminUrl = computed(() => appUrl(`p/${slug.value}/admin`));

const memberUids = computed(() => Object.keys(tenant.value?.members || {}));

async function load() {
  loading.value = true;
  error.value = '';
  tenant.value = null;
  ownerEmail.value = '';
  try {
    tenant.value = await getTenantBySlug(slug.value);
    if (tenant.value) {
      syncEditForm();
      const uid = tenant.value?.meta?.owner_uid || '';
      if (uid) {
        const profile = await getTenantOwnerProfile(tenant.value.tenantId, uid);
        ownerEmail.value = profile?.email || '';
      }
    }
  } catch (e) {
    error.value = e?.message || '載入失敗';
  } finally {
    loading.value = false;
  }
}

watch(slug, load, { immediate: true });

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    memberMsg.value = '已複製連結';
    memberMsgOk.value = true;
  } catch {
    memberMsg.value = '複製失敗';
    memberMsgOk.value = false;
  }
}

async function submitMember() {
  memberMsg.value = '';
  savingMember.value = true;
  try {
    await addTenantMember(tenant.value.tenantId, newMemberUid.value, editorInfo());
    newMemberUid.value = '';
    memberMsg.value = '已加入 members';
    memberMsgOk.value = true;
    await load();
  } catch (e) {
    memberMsg.value = e?.message || '加入失敗';
    memberMsgOk.value = false;
  } finally {
    savingMember.value = false;
  }
}

async function setStatus(status) {
  try {
    await setTenantStatus(tenant.value.tenantId, status, editorInfo());
    await load();
  } catch (e) {
    error.value = e?.message || '更新狀態失敗';
  }
}

async function saveMeta() {
  saveMetaMsg.value = '';
  savingMeta.value = true;
  try {
    await updateTenantMeta(
      tenant.value.tenantId,
      {
        couple_names: editForm.coupleNames.trim(),
        venue_name: editForm.venueName.trim(),
        venue_hall: editForm.venueHall.trim(),
        wedding_date: editForm.weddingDate,
        theme_color: editForm.themeColor,
        plan: editForm.plan,
      },
      editorInfo(),
    );
    saveMetaMsg.value = '已儲存';
    saveMetaOk.value = true;
    await load();
  } catch (e) {
    saveMetaMsg.value = e?.message || '儲存失敗';
    saveMetaOk.value = false;
  } finally {
    savingMeta.value = false;
  }
}

async function saveSlug() {
  slugMsg.value = '';
  savingSlug.value = true;
  try {
    const newSlug = await renameTenantSlug(
      tenant.value.tenantId,
      slug.value,
      editForm.slug,
      editorInfo(),
    );
    slugMsg.value = '連結已更新';
    slugMsgOk.value = true;
    if (newSlug !== slug.value) {
      await router.replace(`/super/tenants/${newSlug}`);
    } else {
      await load();
    }
  } catch (e) {
    slugMsg.value = e?.message || '更新失敗';
    slugMsgOk.value = false;
  } finally {
    savingSlug.value = false;
  }
}

async function resetOwnerPassword() {
  pwMsg.value = '';
  pwMsgOk.value = false;

  const uid = String(pwUid.value || '').trim();
  if (!uid) {
    pwMsg.value = '此 Project 未設定 owner_uid';
    return;
  }
  if (!newPw.value || newPw.value.length < 6) {
    pwMsg.value = '新密碼至少需要 6 個字元';
    return;
  }
  if (newPw.value !== confirmPw.value) {
    pwMsg.value = '兩次輸入的新密碼不一致';
    return;
  }

  savingPw.value = true;
  try {
    await setAuthUserPassword({ uid, newPassword: newPw.value });
    pwMsgOk.value = true;
    pwMsg.value = '已更新 Owner 密碼';
    newPw.value = '';
    confirmPw.value = '';
  } catch (e) {
    pwMsgOk.value = false;
    pwMsg.value = e?.message || '更新密碼失敗';
  } finally {
    savingPw.value = false;
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
  font-size: 0.8rem;
  color: #64748b;
  text-decoration: none;
  margin-bottom: 1rem;
}
.back:hover {
  color: #2563eb;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1.25rem;
}
.head h2 {
  margin: 0;
  font-size: 1.25rem;
}
.sub {
  margin: 0.35rem 0 0;
  font-size: 0.75rem;
  color: #64748b;
}
.muted {
  color: #94a3b8;
}
.error {
  color: #dc2626;
  font-size: 0.875rem;
}
.ok {
  color: #166534;
  font-size: 0.8rem;
}
.hint {
  font-size: 0.85rem;
  color: #b45309;
}
.section {
  margin-bottom: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid #e2e8f0;
}
.section h3 {
  margin: 0 0 0.65rem;
  font-size: 0.9rem;
  color: #475569;
}
.links {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.875rem;
}
.links li {
  margin-bottom: 0.4rem;
}
.links a {
  color: #2563eb;
  word-break: break-all;
}
.btn-copy {
  margin-left: 0.35rem;
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.35rem;
  background: #f8fafc;
  cursor: pointer;
}
.hint-block {
  font-size: 0.8rem;
  color: #64748b;
  margin: 0 0 0.75rem;
  line-height: 1.5;
}
.edit-form {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.edit-form .grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
}
@media (max-width: 640px) {
  .edit-form .grid {
    grid-template-columns: 1fr;
  }
}
.edit-form .field label {
  display: block;
  font-size: 0.75rem;
  font-weight: 700;
  margin-bottom: 0.2rem;
}
.edit-form input[type='text'],
.edit-form input[type='date'],
.edit-form select {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  padding: 0.45rem 0.5rem;
  font-size: 0.875rem;
}
.edit-form input[type='color'] {
  width: 3rem;
  height: 2.25rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
}
.btn-save {
  align-self: flex-start;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.5rem;
  background: #2563eb;
  color: #fff;
  font-weight: 700;
  font-size: 0.875rem;
  cursor: pointer;
}
.btn-save:disabled {
  opacity: 0.7;
}
.meta-readonly {
  margin: 0.35rem 0 0;
  font-size: 0.75rem;
  color: #94a3b8;
}
.slug-form {
  margin-bottom: 0.75rem;
}
.slug-row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-wrap: wrap;
}
.slug-prefix {
  font-size: 0.8rem;
  color: #64748b;
}
.slug-row input {
  flex: 1;
  min-width: 10rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  padding: 0.45rem 0.5rem;
  font-size: 0.875rem;
}
.field-hint {
  font-size: 0.7rem;
  color: #94a3b8;
  margin: 0.25rem 0 0.5rem;
}
.uid-list {
  margin: 0 0 0.75rem;
  padding-left: 1.1rem;
  font-size: 0.8rem;
}
.member-form label {
  display: block;
  font-size: 0.75rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}
.member-row {
  display: flex;
  gap: 0.5rem;
}
.member-row input {
  flex: 1;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  padding: 0.45rem 0.5rem;
  font-size: 0.8rem;
}
.member-row button {
  padding: 0.45rem 0.75rem;
  border: none;
  border-radius: 0.5rem;
  background: #2563eb;
  color: #fff;
  font-weight: 700;
  font-size: 0.8rem;
  cursor: pointer;
}
.status-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.btn-status {
  padding: 0.4rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid #86efac;
  background: #f0fdf4;
  color: #166534;
  font-weight: 700;
  font-size: 0.75rem;
  cursor: pointer;
}
.btn-status.expired {
  border-color: #fecaca;
  background: #fef2f2;
  color: #991b1b;
}
.btn-status:disabled {
  opacity: 0.5;
  cursor: default;
}
.badge {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  background: #dcfce7;
  color: #166534;
  white-space: nowrap;
}
.badge.expired {
  background: #fee2e2;
  color: #991b1b;
}
code {
  font-size: 0.85em;
  background: #f1f5f9;
  padding: 0.1rem 0.3rem;
  border-radius: 0.2rem;
}
</style>
