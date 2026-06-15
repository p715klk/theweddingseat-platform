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
          <th>狀態</th>
          <th>連結</th>
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
          <td>
            <span class="badge" :class="t.meta.status || 'active'">{{ t.meta.status || 'active' }}</span>
          </td>
          <td class="links" @click.stop>
            <a :href="`/p/${t.slug}`" target="_blank" rel="noopener">點名</a>
            <a :href="`/p/${t.slug}/admin`" target="_blank" rel="noopener">後台</a>
            <RouterLink :to="`/super/tenants/${t.slug}`" class="detail-link">詳情</RouterLink>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { listTenants } from '@/composables/useSuperTenants';

const router = useRouter();
const tenants = ref([]);
const loading = ref(true);
const error = ref('');

function venueLabel(meta) {
  const parts = [meta.venue_name, meta.venue_hall].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
}

function goDetail(slug) {
  router.push(`/super/tenants/${slug}`);
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

onMounted(load);

defineExpose({ load });
</script>

<style scoped>
.panel {
  background: #fff;
  border-radius: 0.75rem;
  border: 1px solid #e2e8f0;
  padding: 1.25rem;
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
}
.table th {
  font-size: 0.75rem;
  color: #64748b;
}
.row-click {
  cursor: pointer;
}
.row-click:hover {
  background: #f8fafc;
}
.links {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.links a,
.detail-link {
  color: #2563eb;
  font-weight: 600;
  font-size: 0.75rem;
  text-decoration: none;
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
