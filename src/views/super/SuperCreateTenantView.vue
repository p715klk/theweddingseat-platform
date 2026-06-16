<template>
  <div class="panel">
    <h2>{{ copyFromSlug ? '複製 Project' : '新增客戶 Project' }}</h2>
    <p v-if="prefilling" class="intro muted">⏳ 載入複製資料…</p>
    <p v-else-if="copyFromSlug" class="intro">
      由 <code>{{ copyFromSlug }}</code> 複製賓客、枱位等資料。修改後儲存為新 Project。
    </p>
    <p v-else class="intro">
      建立 slug、meta 同預設資料。客戶 Firebase Auth 帳號仍要喺 Console 開，再貼 UID 落「Owner UID」。
    </p>

    <form class="form" @submit.prevent="submit">
      <div class="field">
        <label>Slug <span class="req">*</span></label>
        <input v-model="form.slug" type="text" placeholder="Mary-Paul-20260915" required :disabled="prefilling || saving" />
        <p class="field-hint">
          預覽（實際儲存嘅 slug）：<code>{{ slugPreview || '…' }}</code>
          <span class="field-hint-note">小寫、空格變 -、首尾 - 會忽略</span>
        </p>
        <p v-if="slugStatus === 'incomplete'" class="slug-status incomplete">
          {{ slugIncompleteMsg }}
          <span v-if="slugPreview">（若而家停止輸入，會變成 <code>{{ slugPreview }}</code>）</span>
        </p>
        <p v-else-if="slugStatus === 'checking'" class="slug-status checking">檢查「{{ slugPreview }}」是否可用…</p>
        <p v-else-if="slugStatus === 'invalid'" class="slug-status invalid">
          Slug 格式無效（小寫英文、數字、連字號，至少 2 個字元）
        </p>
        <p v-else-if="slugStatus === 'taken'" class="slug-status taken">
          <span v-if="slugIncompleteMsg" class="taken-sub">{{ slugIncompleteMsg }}</span>
          Slug「{{ slugPreview }}」已被使用，請改用其他名稱          
        </p>
        <p v-else-if="slugStatus === 'available'" class="slug-status available">✓ 此 slug 可用</p>
      </div>

      <div class="field">
        <label>新人姓名 <span class="req">*</span></label>
        <input v-model="form.coupleNames" type="text" required placeholder="Mary & Paul" :disabled="prefilling || saving" />
      </div>

      <div class="grid">
        <div class="field">
          <label>酒店 <span class="req">*</span></label>
          <input v-model="form.venueName" type="text" required :disabled="prefilling || saving" />
        </div>
        <div class="field">
          <label>宴會廳</label>
          <input v-model="form.venueHall" type="text" :disabled="prefilling || saving" />
        </div>
      </div>

      <div class="grid">
        <div class="field">
          <label>婚期 <span class="req">*</span></label>
          <input v-model="form.weddingDate" type="date" required :disabled="prefilling || saving" />
        </div>
        <div class="field">
          <label>主題色</label>
          <input v-model="form.themeColor" type="color" :disabled="prefilling || saving" />
        </div>
      </div>

      <div class="field">
        <label>客戶 Owner UID（選填）</label>
        <input v-model="form.ownerUid" type="text" placeholder="Firebase Auth → User UID" :disabled="prefilling || saving" />
        <p class="field-hint">
          喺 Authentication 開好客戶帳號後，貼 UID 會自動寫入 <code>members/{uid}</code>
        </p>
      </div>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="actions">
        <RouterLink to="/super/tenants" class="btn-cancel">取消</RouterLink>
        <button type="submit" class="btn-submit" :disabled="saving || prefilling || !canSubmit">
          {{ saving ? '建立中…' : (copyFromSlug ? '儲存為新 Project' : '建立 Project') }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '@/composables/useAuth';
import {
  createTenant,
  cloneTenant,
  getTenantBySlug,
  suggestCloneSlug,
  normalizeSlug,
  getSlugInputState,
  isValidSlug,
  isSlugTaken,
} from '@/composables/useSuperTenants';

const route = useRoute();
const router = useRouter();
const { user } = useAuth();

const copyFromSlug = computed(() => String(route.query.copy || '').trim());
const copySourceTenantId = ref('');
const copyPlan = ref('standard');
const prefilling = ref(false);
const slugStatus = ref('idle');
const slugIncompleteMsg = ref('');

const form = reactive({
  slug: '',
  coupleNames: '',
  venueName: '',
  venueHall: '',
  weddingDate: '',
  themeColor: '#b91c1c',
  ownerUid: '',
});

const saving = ref(false);
const error = ref('');

const slugPreview = computed(() => normalizeSlug(form.slug));

const canSubmit = computed(() => slugStatus.value === 'available');

let slugCheckTimer = null;
let slugCheckSeq = 0;

async function checkSlugAvailability(rawInput) {
  const state = getSlugInputState(rawInput);

  if (state.phase === 'idle') {
    slugStatus.value = 'idle';
    slugIncompleteMsg.value = '';
    return;
  }
  if (state.phase === 'incomplete') {
    slugIncompleteMsg.value = state.message;
    if (state.normalized && isValidSlug(state.normalized)) {
      const seq = ++slugCheckSeq;
      slugStatus.value = 'checking';
      try {
        const taken = await isSlugTaken(state.normalized);
        if (seq !== slugCheckSeq) return;
        slugStatus.value = taken ? 'taken' : 'incomplete';
        if (!taken) slugIncompleteMsg.value = state.message;
      } catch {
        if (seq !== slugCheckSeq) return;
        slugStatus.value = 'incomplete';
      }
    } else {
      slugStatus.value = 'incomplete';
    }
    return;
  }
  slugIncompleteMsg.value = '';
  if (state.phase === 'invalid') {
    slugStatus.value = 'invalid';
    return;
  }

  const seq = ++slugCheckSeq;
  slugStatus.value = 'checking';
  try {
    const taken = await isSlugTaken(state.normalized);
    if (seq !== slugCheckSeq) return;
    slugStatus.value = taken ? 'taken' : 'available';
  } catch {
    if (seq !== slugCheckSeq) return;
    slugStatus.value = 'idle';
  }
}

function scheduleSlugCheck(rawInput) {
  clearTimeout(slugCheckTimer);
  slugCheckTimer = setTimeout(() => checkSlugAvailability(rawInput), 350);
}

function editorInfo() {
  if (!user.value) return null;
  return { uid: user.value.uid, email: user.value.email || '' };
}

async function loadCopySource(slug) {
  if (!slug) {
    copySourceTenantId.value = '';
    return;
  }
  prefilling.value = true;
  error.value = '';
  try {
    const tenant = await getTenantBySlug(slug);
    if (!tenant) {
      error.value = `找不到來源 Project「${slug}」`;
      copySourceTenantId.value = '';
      return;
    }
    copySourceTenantId.value = tenant.tenantId;
    copyPlan.value = tenant.meta.plan || 'standard';
    const m = tenant.meta;
    form.coupleNames = m.couple_names || '';
    form.venueName = m.venue_name || '';
    form.venueHall = m.venue_hall || '';
    form.weddingDate = m.wedding_date || '';
    form.themeColor = m.theme_color || '#b91c1c';
    form.ownerUid = '';
    form.slug = await suggestCloneSlug(slug);
  } catch (e) {
    error.value = e?.message || '載入複製資料失敗';
    copySourceTenantId.value = '';
  } finally {
    prefilling.value = false;
  }
}

watch(copyFromSlug, (slug) => loadCopySource(slug), { immediate: true });

watch(() => form.slug, (raw) => scheduleSlugCheck(raw));

async function submit() {
  error.value = '';
  saving.value = true;
  try {
    const payload = {
      slug: form.slug,
      coupleNames: form.coupleNames,
      venueName: form.venueName,
      venueHall: form.venueHall,
      weddingDate: form.weddingDate,
      themeColor: form.themeColor,
      ownerUid: form.ownerUid,
      editor: editorInfo(),
    };
    const result = copySourceTenantId.value
      ? await cloneTenant({ ...payload, sourceTenantId: copySourceTenantId.value, plan: copyPlan.value })
      : await createTenant(payload);
    router.push(`/super/tenants/${result.slug}`);
  } catch (e) {
    error.value = e?.message || '建立失敗';
  } finally {
    saving.value = false;
  }
}

onUnmounted(() => {
  clearTimeout(slugCheckTimer);
});
</script>

<style scoped>
.panel {
  background: #fff;
  border-radius: 0.75rem;
  border: 1px solid #e2e8f0;
  padding: 1.25rem;
}
.panel h2 {
  margin: 0 0 0.5rem;
}
.intro {
  font-size: 0.875rem;
  color: #64748b;
  margin: 0 0 1.25rem;
}
.intro.muted {
  color: #94a3b8;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
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
}
.req {
  color: #dc2626;
}
.field input[type='text'],
.field input[type='date'] {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  padding: 0.5rem;
  font-size: 0.875rem;
}
.field input[type='color'] {
  width: 3rem;
  height: 2.25rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  padding: 0.15rem;
}
.field-hint {
  font-size: 0.7rem;
  color: #94a3b8;
  margin: 0.25rem 0 0;
}
.slug-status {
  font-size: 0.75rem;
  font-weight: 600;
  margin: 0.35rem 0 0;
}
.slug-status.checking,
.slug-status.incomplete {
  color: #64748b;
}
.slug-status.incomplete code {
  font-size: 0.85em;
}
.field-hint-note {
  display: block;
  margin-top: 0.15rem;
  color: #94a3b8;
}
.slug-status.invalid,
.slug-status.taken {
  color: #dc2626;
}
.slug-status.taken .taken-sub {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.7rem;
  font-weight: 500;
  color: #64748b;
}
.slug-status.available {
  color: #15803d;
}
.error {
  color: #dc2626;
  font-size: 0.875rem;
}
.actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.btn-cancel {
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  background: #e2e8f0;
  color: #334155;
  font-weight: 700;
  font-size: 0.875rem;
  text-decoration: none;
}
.btn-submit {
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  background: #2563eb;
  color: #fff;
  font-weight: 700;
  font-size: 0.875rem;
  border: none;
  cursor: pointer;
}
.btn-submit:disabled {
  opacity: 0.7;
}
code {
  font-size: 0.85em;
  background: #f1f5f9;
  padding: 0.1rem 0.3rem;
  border-radius: 0.2rem;
}
</style>
