<template>
  <div class="panel">
    <h2>客戶 Project 列表</h2>

    <p v-if="loading" class="muted">⏳ 載入中...</p>
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
          <th>狀態</th>
          <th>連結</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in tenants" :key="t.tenantId">
          <td><code>{{ t.slug }}</code></td>
          <td>{{ t.meta.couple_names || '—' }}</td>
          <td>{{ venueLabel(t.meta) }}</td>
          <td>{{ t.meta.wedding_date || '—' }}</td>
          <td>
            <span class="badge" :class="t.meta.status || 'active'">{{ t.meta.status || 'active' }}</span>
          </td>
          <td class="links">
            <a :href="`/p/${t.slug}`" target="_blank" rel="noopener">點名</a>
            <a :href="`/p/${t.slug}/admin`" target="_blank" rel="noopener">後台</a>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { listTenants } from '@/composables/useSuperTenants';

const tenants = ref([]);
const loading = ref(true);
const error = ref('');

function venueLabel(meta) {
  const parts = [meta.venue_name, meta.venue_hall].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
}

onMounted(async () => {
  loading.value = true;
  error.value = '';
  try {
    tenants.value = await listTenants();
  } catch (e) {
    error.value = e?.message || '載入失敗';
  } finally {
    loading.value = false;
  }
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
  margin: 0 0 1rem;
  font-size: 1.125rem;
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
}
.table th {
  font-size: 0.75rem;
  color: #64748b;
}
.links {
  display: flex;
  gap: 0.5rem;
}
.links a {
  color: #2563eb;
  font-weight: 600;
  font-size: 0.75rem;
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
</style>
