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
        <span class="badge" :class="featureBadgeClass">{{ featureLabel }}</span>
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
        <p class="hint-block">你係 super admin，可以改晒以下資料。</p>
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
        <p class="meta-readonly">
          Owner：
          <select v-model="pwUid" class="owner-select" @change="saveOwnerUid">
            <option value="">—</option>
            <option v-for="m in memberEntries" :key="m.uid" :value="m.uid">
              {{ m.email || m.uid }}
            </option>
          </select>
        </p>
      </section>

      <section class="section">
        <h3>後台權限（members）</h3>
        <p v-if="!memberUids.length" class="hint">尚未設定。客戶無法登入後台改賓客。</p>
        <ul v-else class="uid-list">
          <li v-for="m in memberEntries" :key="m.uid">
            <code>{{ m.email || m.uid }}</code>
            <span v-if="m.initialPassword" class="pw-chip">
              密碼：
              <code>{{ pwVisible[m.uid] ? m.initialPassword : '********' }}</code>
              <button type="button" class="btn-eye" @click="pwVisible[m.uid] = !pwVisible[m.uid]">
                {{ pwVisible[m.uid] ? '隱藏' : '顯示' }}
              </button>
            </span>
          </li>
        </ul>
      </section>

      <section class="section">
        <h3>新增後台用戶（members）</h3>
        <p class="hint-block">會建立一個新登入帳號，並加入此 Project 嘅 <code>members</code>。</p>
        <div v-if="createdOwner" class="created-box">
          <p class="created-title">✅ 已加入 members</p>
          <ul class="created-list">
            <li>Email：<code>{{ createdOwner.email }}</code></li>
            <li>
              初始密碼：<code>{{ createdOwner.password }}</code>
              <button type="button" class="btn-copy" @click="copy(createdOwner.password)">複製</button>
            </li>
          </ul>
          <p class="field-hint">此密碼會儲存喺 members 清單（預設遮住）；請即時複製交畀客戶。</p>
        </div>
        <form class="edit-form" @submit.prevent="submitOwner">
          <div class="grid">
            <div class="field">
              <label>用戶 Email <span class="req">*</span></label>
              <input v-model="ownerForm.email" type="email" required autocomplete="off" placeholder="client@example.com" />
            </div>
            <div class="field">
              <label>初始密碼 <span class="req">*</span></label>
              <div class="pw-row">
                <input v-model="ownerForm.password" type="text" required minlength="6" autocomplete="new-password" />
                <button type="button" class="btn-generate" :disabled="savingOwner" @click="generateOwnerPw">生成</button>
              </div>              
            </div>
          </div>
          <div class="field">
            <label>顯示名稱</label>
            <input v-model="ownerForm.displayName" type="text" placeholder="例如：Mary（新娘）" />
          </div>
          <p v-if="ownerMsg" :class="ownerMsgOk ? 'ok' : 'error'">{{ ownerMsg }}</p>
          <button type="submit" class="btn-save" :disabled="savingOwner">
            {{ savingOwner ? '建立中…' : '➕ 建立並加入 members' }}
          </button>
        </form>
      </section>

      <section class="section">
        <h3>重設 Owner 密碼</h3>
        <p class="hint-block">
          平台無法直接幫其他帳號重設密碼。請到 Firebase Console → Authentication 用 email 搵到該用戶再重設。
        </p>
      </section>

      <section class="section">
        <h3>功能開關</h3>
        <p class="hint-block">Super admin 仍可進入預覽。</p>
        <ul class="feature-toggles">
          <li v-for="item in featureItems" :key="item.key">
            <div class="feature-label">
              <strong>{{ item.label }}</strong>
              <span class="feature-desc">{{ item.desc }}</span>
            </div>
            <label class="switch">
              <input
                type="checkbox"
                :checked="featureForm[item.key]"
                :disabled="savingFeatures"
                @change="toggleFeature(item.key, $event.target.checked)"
              />
              <span class="slider" aria-hidden="true" />
            </label>
          </li>
        </ul>
        <p v-if="featureMsg" :class="featureMsgOk ? 'ok' : 'error'">{{ featureMsg }}</p>
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
  createTenantMemberUser,
  getTenantUserProfiles,
  setTenantFeatures,
  updateTenantMeta,
  renameTenantSlug,
  normalizeSlug,
  formatAuditTime,
} from '@/composables/useSuperTenants';
import { appUrl } from '@/lib/appBase';
import {
  DEFAULT_TENANT_FEATURES,
  resolveTenantFeatures,
  featureStatusLabel,
} from '@/lib/tenantFeatures';

const route = useRoute();
const router = useRouter();
const { user } = useAuth();
const slug = computed(() => String(route.params.slug || ''));
const tenant = ref(null);
const loading = ref(true);
const error = ref('');
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
const savingOwner = ref(false);
const ownerMsg = ref('');
const ownerMsgOk = ref(false);
const createdOwner = ref(null);
const memberProfiles = ref({});
const pwVisible = reactive({});
const savingFeatures = ref(false);
const featureMsg = ref('');
const featureMsgOk = ref(true);

const featureForm = reactive({ ...DEFAULT_TENANT_FEATURES });

const featureItems = [
  { key: 'checkin', label: '點名', desc: '公開點名頁；可改已到／未到' },
  { key: 'guestlist', label: '名單', desc: '後台賓客名單、匯入 CSV' },
  { key: 'seating', label: '畫布', desc: '排位畫布同枱位設定' },
];

const featureLabel = computed(() =>
  tenant.value ? featureStatusLabel(tenant.value.meta) : '',
);

const featureBadgeClass = computed(() => {
  if (!tenant.value) return 'active';
  const f = resolveTenantFeatures(tenant.value.meta);
  if (f.checkin && f.guestlist && f.seating) return 'active';
  return 'partial';
});

const editForm = reactive({
  slug: '',
  coupleNames: '',
  venueName: '',
  venueHall: '',
  weddingDate: '',
  themeColor: '#b91c1c',
  plan: 'standard',
});

const ownerForm = reactive({
  email: '',
  password: '',
  displayName: '',
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

function syncFeatureForm() {
  const f = resolveTenantFeatures(tenant.value?.meta);
  featureForm.checkin = f.checkin;
  featureForm.guestlist = f.guestlist;
  featureForm.seating = f.seating;
}

const checkInUrl = computed(() => appUrl(`p/${slug.value}`));
const adminUrl = computed(() => appUrl(`p/${slug.value}/admin`));

const memberUids = computed(() => Object.keys(tenant.value?.members || {}));
const memberEntries = computed(() =>
  memberUids.value.map((uid) => {
    const p = memberProfiles.value?.[uid] || {};
    return {
      uid,
      email: p.email || '',
      initialPassword: p.initial_password || '',
    };
  }),
);

async function load() {
  loading.value = true;
  error.value = '';
  tenant.value = null;
  ownerEmail.value = '';
  memberProfiles.value = {};
  try {
    tenant.value = await getTenantBySlug(slug.value);
    if (tenant.value) {
      syncEditForm();
      syncFeatureForm();
      const uid = tenant.value?.meta?.owner_uid || '';
      if (uid) {
        const profile = await getTenantOwnerProfile(tenant.value.tenantId, uid);
        ownerEmail.value = profile?.email || '';
      }
      memberProfiles.value = await getTenantUserProfiles(tenant.value.tenantId);
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

function generateOwnerPw() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < 12; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  ownerForm.password = out;
}

async function submitOwner() {
  ownerMsg.value = '';
  ownerMsgOk.value = false;
  createdOwner.value = null;
  savingOwner.value = true;
  try {
    await createTenantMemberUser({
      tenantId: tenant.value.tenantId,
      email: ownerForm.email,
      password: ownerForm.password,
      displayName: ownerForm.displayName,
      editor: editorInfo(),
    });
    ownerMsgOk.value = true;
    ownerMsg.value = '已建立並加入 members';
    createdOwner.value = { email: ownerForm.email.trim(), password: ownerForm.password };
    ownerForm.email = '';
    ownerForm.password = '';
    ownerForm.displayName = '';
    await load();
  } catch (e) {
    ownerMsgOk.value = false;
    ownerMsg.value = e?.message || '建立失敗';
  } finally {
    savingOwner.value = false;
  }
}

async function toggleFeature(key, enabled) {
  featureForm[key] = enabled;
  savingFeatures.value = true;
  featureMsg.value = '';
  try {
    await setTenantFeatures(
      tenant.value.tenantId,
      {
        checkin: featureForm.checkin,
        guestlist: featureForm.guestlist,
        seating: featureForm.seating,
      },
      editorInfo(),
    );
    featureMsg.value = '已更新';
    featureMsgOk.value = true;
    await load();
  } catch (e) {
    featureMsg.value = e?.message || '更新失敗';
    featureMsgOk.value = false;
    syncFeatureForm();
  } finally {
    savingFeatures.value = false;
  }
}

async function saveOwnerUid() {
  try {
    const uid = String(pwUid.value || '').trim();
    await updateTenantMeta(tenant.value.tenantId, { owner_uid: uid || null }, editorInfo());
    await load();
  } catch (e) {
    error.value = e?.message || '更新 Owner 失敗';
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
.edit-form input[type='email'],
.edit-form input[type='date'],
.edit-form select {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  padding: 0.45rem 0.5rem;
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
.btn-generate {
  flex-shrink: 0;
  padding: 0.45rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #334155;
  font-weight: 800;
  font-size: 0.75rem;
  cursor: pointer;
}
.btn-generate:disabled {
  opacity: 0.7;
  cursor: default;
}
.created-box {
  border: 1px solid #bbf7d0;
  background: #f0fdf4;
  border-radius: 0.75rem;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
}
.created-title {
  margin: 0 0 0.5rem;
  font-weight: 800;
  color: #166534;
  font-size: 0.875rem;
}
.created-list {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.8rem;
  color: #14532d;
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
.owner-select {
  margin-left: 0.35rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  background: #fff;
  color: #334155;
}
.owner-uid {
  margin-left: 0.35rem;
  color: #94a3b8;
  font-size: 0.75rem;
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
.pw-chip {
  margin-left: 0.4rem;
  color: #64748b;
  font-size: 0.75rem;
}
.btn-eye {
  margin-left: 0.35rem;
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.35rem;
  background: #f8fafc;
  cursor: pointer;
}
.status-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.feature-toggles {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.feature-toggles li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  background: #f8fafc;
}
.feature-label {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.feature-label strong {
  font-size: 0.875rem;
  color: #334155;
}
.feature-desc {
  font-size: 0.7rem;
  color: #94a3b8;
}
.switch {
  position: relative;
  display: inline-block;
  width: 2.75rem;
  height: 1.5rem;
  flex-shrink: 0;
}
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: #cbd5e1;
  border-radius: 999px;
  transition: background 0.2s;
}
.slider::before {
  content: '';
  position: absolute;
  height: 1.125rem;
  width: 1.125rem;
  left: 0.2rem;
  bottom: 0.1875rem;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.15);
}
.switch input:checked + .slider {
  background: #16a34a;
}
.switch input:checked + .slider::before {
  transform: translateX(1.2rem);
}
.switch input:disabled + .slider {
  opacity: 0.55;
  cursor: not-allowed;
}
.badge.partial {
  background: #fff7ed;
  color: #c2410c;
  border-color: #fdba74;
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
