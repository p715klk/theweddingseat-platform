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
        <h3>連結</h3>
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
        <h3>Project 資料</h3>
        <dl class="dl">
          <dt>新人</dt>
          <dd>{{ tenant.meta.couple_names || '—' }}</dd>
          <dt>酒店</dt>
          <dd>{{ tenant.meta.venue_name || '—' }}</dd>
          <dt>宴會廳</dt>
          <dd>{{ tenant.meta.venue_hall || '—' }}</dd>
          <dt>婚期</dt>
          <dd>{{ tenant.meta.wedding_date || '—' }}</dd>
          <dt>Plan</dt>
          <dd>{{ tenant.meta.plan || 'standard' }}</dd>
          <dt>建立時間</dt>
          <dd>{{ createdLabel }}</dd>
        </dl>
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
        <h3>狀態</h3>
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
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  getTenantBySlug,
  addTenantMember,
  setTenantStatus,
} from '@/composables/useSuperTenants';

const route = useRoute();
const slug = computed(() => String(route.params.slug || ''));
const tenant = ref(null);
const loading = ref(true);
const error = ref('');
const newMemberUid = ref('');
const savingMember = ref(false);
const memberMsg = ref('');
const memberMsgOk = ref(false);

const checkInUrl = computed(() => `${window.location.origin}/p/${slug.value}`);
const adminUrl = computed(() => `${window.location.origin}/p/${slug.value}/admin`);

const memberUids = computed(() => Object.keys(tenant.value?.members || {}));

const createdLabel = computed(() => {
  const ts = tenant.value?.meta?.created_at;
  if (!ts) return '—';
  return new Date(ts).toLocaleString('zh-HK');
});

async function load() {
  loading.value = true;
  error.value = '';
  tenant.value = null;
  try {
    tenant.value = await getTenantBySlug(slug.value);
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
    await addTenantMember(tenant.value.tenantId, newMemberUid.value);
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
    await setTenantStatus(tenant.value.tenantId, status);
    await load();
  } catch (e) {
    error.value = e?.message || '更新狀態失敗';
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
.dl {
  display: grid;
  grid-template-columns: 6rem 1fr;
  gap: 0.35rem 0.75rem;
  margin: 0;
  font-size: 0.875rem;
}
.dl dt {
  color: #64748b;
  font-weight: 600;
}
.dl dd {
  margin: 0;
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
