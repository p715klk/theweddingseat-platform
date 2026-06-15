<template>
  <div class="panel">
    <h2>新增客戶 Project</h2>
    <p class="intro">
      建立 slug、meta 同預設資料。客戶 Firebase Auth 帳號仍要喺 Console 開，再貼 UID 落「Owner UID」。
    </p>

    <form class="form" @submit.prevent="submit">
      <div class="field">
        <label>Slug <span class="req">*</span></label>
        <input v-model="form.slug" type="text" placeholder="chen-wong-20260915" required />
        <p class="field-hint">預覽：<code>{{ slugPreview || '…' }}</code></p>
      </div>

      <div class="field">
        <label>新人姓名 <span class="req">*</span></label>
        <input v-model="form.coupleNames" type="text" required placeholder="陳大文 & 李小美" />
      </div>

      <div class="grid">
        <div class="field">
          <label>酒店 <span class="req">*</span></label>
          <input v-model="form.venueName" type="text" required />
        </div>
        <div class="field">
          <label>宴會廳</label>
          <input v-model="form.venueHall" type="text" />
        </div>
      </div>

      <div class="grid">
        <div class="field">
          <label>婚期 <span class="req">*</span></label>
          <input v-model="form.weddingDate" type="date" required />
        </div>
        <div class="field">
          <label>主題色</label>
          <input v-model="form.themeColor" type="color" />
        </div>
      </div>

      <div class="field">
        <label>客戶 Owner UID（選填）</label>
        <input v-model="form.ownerUid" type="text" placeholder="Firebase Auth → User UID" />
        <p class="field-hint">
          喺 Authentication 開好客戶帳號後，貼 UID 會自動寫入 <code>members/{uid}</code>
        </p>
      </div>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="actions">
        <RouterLink to="/super/tenants" class="btn-cancel">取消</RouterLink>
        <button type="submit" class="btn-submit" :disabled="saving">
          {{ saving ? '建立中…' : '建立 Project' }}
        </button>
      </div>
    </form>

    <div v-if="created" class="success">
      <h3>✅ 已建立</h3>
      <ul>
        <li>點名頁：<a :href="created.checkInUrl" target="_blank">{{ created.checkInUrl }}</a></li>
        <li>後台：<a :href="created.adminUrl" target="_blank">{{ created.adminUrl }}</a></li>
      </ul>
      <p v-if="!form.ownerUid.trim()" class="warn">
        記得喺 Firebase Authentication 開客戶帳號，再手動加 <code>members</code> 或重新編輯。
      </p>
      <RouterLink to="/super/tenants" class="link">返回列表 →</RouterLink>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { createTenant, normalizeSlug } from '@/composables/useSuperTenants';

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
const created = ref(null);

const slugPreview = computed(() => normalizeSlug(form.slug));

async function submit() {
  error.value = '';
  created.value = null;
  saving.value = true;
  try {
    created.value = await createTenant({
      slug: form.slug,
      coupleNames: form.coupleNames,
      venueName: form.venueName,
      venueHall: form.venueHall,
      weddingDate: form.weddingDate,
      themeColor: form.themeColor,
      ownerUid: form.ownerUid,
    });
  } catch (e) {
    error.value = e?.message || '建立失敗';
  } finally {
    saving.value = false;
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
.panel h2 {
  margin: 0 0 0.5rem;
}
.intro {
  font-size: 0.875rem;
  color: #64748b;
  margin: 0 0 1.25rem;
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
.success {
  margin-top: 1.5rem;
  padding: 1rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 0.5rem;
}
.success h3 {
  margin: 0 0 0.5rem;
  color: #166534;
}
.success ul {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 0.875rem;
}
.warn {
  font-size: 0.8rem;
  color: #b45309;
  margin: 0.75rem 0 0;
}
.link {
  display: inline-block;
  margin-top: 0.75rem;
  color: #2563eb;
  font-weight: 700;
  font-size: 0.875rem;
}
code {
  font-size: 0.85em;
  background: #f1f5f9;
  padding: 0.1rem 0.3rem;
  border-radius: 0.2rem;
}
</style>
