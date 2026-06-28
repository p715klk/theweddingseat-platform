<template>
  <div class="audit-panel">
    <div class="audit-toolbar">
      <p class="audit-hint">
        記錄後台重要操作，僅 Owner 與 Super Admin 可查看。
      </p>
      <div class="audit-controls">
        <label class="per-page-label" for="audit-per-page">每頁</label>
        <select
          id="audit-per-page"
          :value="perPage"
          :disabled="loading"
          @change="onPerPageChange"
        >
          <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}</option>
        </select>
        <button type="button" class="btn-refresh" :disabled="loading" @click="reload">
          {{ loading ? '載入中…' : '重新整理' }}
        </button>
      </div>
    </div>

    <p v-if="error" class="msg-error">{{ error }}</p>

    <div v-else-if="loading && !items.length" class="audit-empty">載入中…</div>
    <div v-else-if="!items.length" class="audit-empty">暫無操作記錄</div>

    <div v-else class="audit-table-wrap">
      <table class="audit-table">
        <thead>
          <tr>
            <th>時間</th>
            <th>用戶</th>
            <th>頁面</th>
            <th>操作</th>
            <th>詳情</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in items" :key="row.id || `${row.created_at}-${row.action}`">
            <td class="time-cell">{{ formatAuditTime(row.created_at) }}</td>
            <td class="user-cell">{{ row.user_email || row.user_id || '—' }}</td>
            <td>{{ row.page || '—' }}</td>
            <td>{{ row.action || '—' }}</td>
            <td class="detail-cell">{{ row.detail || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="total > 0" class="audit-pagination">
      <button type="button" class="page-btn" :disabled="loading || page <= 1" @click="goPage(page - 1)">
        上一頁
      </button>
      <span class="page-info">
        第 {{ page }} / {{ totalPages }} 頁（共 {{ total }} 筆）
      </span>
      <button
        type="button"
        class="page-btn"
        :disabled="loading || page >= totalPages"
        @click="goPage(page + 1)"
      >
        下一頁
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import {
  AUDIT_PAGE_SIZE_OPTIONS,
  fetchAuditLogs,
  formatAuditTime,
} from '@/lib/auditLog';

const props = defineProps({
  tenantId: { type: String, required: true },
});

const pageSizeOptions = AUDIT_PAGE_SIZE_OPTIONS;
const perPage = ref(30);
const page = ref(1);
const total = ref(0);
const items = ref([]);
const loading = ref(false);
const error = ref('');

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / perPage.value) || 1));

async function load() {
  if (!props.tenantId) return;
  loading.value = true;
  error.value = '';
  try {
    const data = await fetchAuditLogs({
      tenantId: props.tenantId,
      page: page.value,
      perPage: perPage.value,
    });
    items.value = data.items || [];
    total.value = data.total ?? items.value.length;
    page.value = data.page || page.value;
    perPage.value = data.perPage || perPage.value;
  } catch (e) {
    error.value = e?.message || '載入操作記錄失敗';
    items.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function reload() {
  void load();
}

function goPage(next) {
  const n = Math.max(1, Math.min(next, totalPages.value));
  if (n === page.value) return;
  page.value = n;
  void load();
}

function onPerPageChange(e) {
  const n = parseInt(e.target.value, 10);
  if (!pageSizeOptions.includes(n)) return;
  perPage.value = n;
  page.value = 1;
  void load();
}

watch(
  () => props.tenantId,
  () => {
    page.value = 1;
    void load();
  },
  { immediate: true },
);
</script>

<style scoped>
.audit-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.audit-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}
.audit-hint {
  margin: 0;
  font-size: 0.75rem;
  color: #6b7280;
  line-height: 1.5;
  flex: 1;
  min-width: 12rem;
}
.audit-controls {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}
.per-page-label {
  font-size: 0.7rem;
  font-weight: 700;
  color: #6b7280;
}
.audit-controls select {
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  padding: 0.25rem 0.4rem;
  font-size: 0.75rem;
  background: #fff;
}
.btn-refresh {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #374151;
  border-radius: 0.375rem;
  padding: 0.25rem 0.55rem;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
}
.btn-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.audit-table-wrap {
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  overflow-x: auto;
}
.audit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
}
.audit-table th,
.audit-table td {
  border-bottom: 1px solid #f3f4f6;
  padding: 0.45rem 0.55rem;
  text-align: left;
  vertical-align: top;
}
.audit-table tr:last-child td {
  border-bottom: none;
}
.audit-table th {
  font-size: 0.65rem;
  font-weight: 700;
  color: #6b7280;
  background: #f9fafb;
  white-space: nowrap;
}
.time-cell {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.user-cell {
  word-break: break-all;
  max-width: 10rem;
}
.detail-cell {
  color: #4b5563;
  word-break: break-word;
  max-width: 14rem;
}
.audit-empty {
  padding: 1.5rem;
  text-align: center;
  font-size: 0.8rem;
  color: #9ca3af;
}
.audit-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
}
.page-btn {
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #374151;
  border-radius: 0.375rem;
  padding: 0.3rem 0.65rem;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
}
.page-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.page-info {
  font-size: 0.7rem;
  color: #6b7280;
}
.msg-error {
  color: #dc2626;
  font-size: 0.75rem;
  margin: 0;
}
</style>
