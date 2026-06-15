<template>
  <div id="table-scroll-container" ref="scrollContainer" class="overflow-auto flex-1 w-full">
    <table class="w-full text-left border-collapse table-fixed min-w-[1200px]" id="excel-table">
      <thead class="bg-gray-50 sticky top-0 z-20 shadow-sm border-b border-gray-200">
        <tr id="excel-thead-tr" ref="theadRowRef">
          <th
            class="py-2 px-2 text-center text-sm font-bold text-gray-500 border-b border-gray-200"
            style="width:28px"
            data-min-width="24"
          >
            順序
          </th>
          <th
            class="py-2 px-2 text-center text-sm font-bold text-gray-500 border-b border-gray-200"
            style="width:28px"
            data-min-width="24"
          >
            拖動
          </th>
          <th
            class="py-2 px-2 text-center text-sm font-bold text-gray-600 border-b border-gray-200"
            style="width:50px"
            data-min-width="40"
          >
            桌號
          </th>
          <th
            class="py-2 px-2 text-center text-sm font-bold text-gray-600 border-b border-gray-200"
            style="width:100px"
            data-min-width="88"
          >
            桌次座位
          </th>
          <th
            class="py-2 px-2 text-left text-sm font-bold text-gray-600 border-b border-gray-200"
            style="width:150px"
            data-min-width="128"
          >
            賓客姓名
          </th>
          <th
            class="py-2 px-2 text-center text-sm font-bold text-gray-600 border-b border-gray-200"
            style="width:56px"
            data-min-width="50"
          >
            來源
          </th>
          <th
            class="py-2 px-2 text-left text-sm font-bold text-red-700 bg-red-50/40 border-b border-gray-200"
            style="width:200px"
            data-min-width="160"
          >
            標籤 (可多選)
          </th>
          <th
            class="py-2 px-2 text-center text-sm font-bold text-gray-600 border-b border-gray-200"
            style="width:64px"
            data-min-width="56"
          >
            操作
          </th>
        </tr>
      </thead>
      <tbody id="excel-tbody" ref="tbodyRef" class="text-sm font-medium text-gray-700">
        <tr v-if="loading">
          <td colspan="8" class="text-center py-8 text-gray-400 font-bold">⏳ 正在從 Firebase 載入名單數據...</td>
        </tr>
        <tr v-else-if="loadError">
          <td colspan="8" class="text-center py-8 text-red-500 font-bold">
            ❌ 數據載入失敗{{ loadError ? `：${loadError}` : '' }}
            <br />
            <button type="button" class="mt-3 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold" @click="emit('retry')">
              🔄 重試
            </button>
          </td>
        </tr>
        <tr v-else-if="!guests.length">
          <td colspan="8" class="text-center py-8 text-gray-400 font-bold">🎉 目前沒有賓客，請點右上角「新增賓客」。</td>
        </tr>
        <template v-else>
          <AdminGuestRow
            v-for="(guest, index) in guests"
            :key="guest._key"
            :guest="guest"
            :index="index"
            :categories="categories"
            :get-max-seats="getMaxSeats"
            @dirty="emit('dirty')"
            @table-change="(g) => emit('table-change', g)"
            @seat-change="(g, seat) => emit('seat-change', g, seat)"
            @remove="emit('remove', index)"
            @add-category="(name) => emit('add-category', name)"
            @request-delete-category="emit('request-delete-category')"
          />
        </template>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue';
import Sortable from 'sortablejs';
import AdminGuestRow from '@/components/admin/AdminGuestRow.vue';
import { useAdminColumnResize } from '@/composables/useAdminColumnResize';

const props = defineProps({
  guests: { type: Array, default: () => [] },
  categories: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  loadError: { type: String, default: '' },
  getMaxSeats: { type: Function, required: true },
});

const emit = defineEmits([
  'dirty',
  'reorder',
  'table-change',
  'seat-change',
  'remove',
  'add-category',
  'request-delete-category',
  'retry',
]);

const tbodyRef = ref(null);
const theadRowRef = ref(null);
const scrollContainer = ref(null);
const tableReady = computed(() => !props.loading && !props.loadError);

useAdminColumnResize(theadRowRef, tableReady);

let sortable = null;

function tearDownSortable() {
  if (sortable) {
    sortable.destroy();
    sortable = null;
  }
}

function scrollToEnd() {
  const el = scrollContainer.value;
  if (el) el.scrollTop = el.scrollHeight;
}

function setupSortable({ scrollToBottom = false } = {}) {
  tearDownSortable();
  if (!tbodyRef.value || props.loading || props.loadError || !props.guests.length) return;

  sortable = Sortable.create(tbodyRef.value, {
    handle: '.drag-handle',
    filter: '.row-guest-canceled',
    preventOnFilter: true,
    animation: 150,
    ghostClass: 'sortable-ghost',
    onEnd(evt) {
      if (evt.oldIndex == null || evt.newIndex == null) return;
      emit('reorder', evt.oldIndex, evt.newIndex);
    },
  });

  if (scrollToBottom) {
    nextTick(scrollToEnd);
  }
}

onMounted(() => nextTick(() => setupSortable()));

watch(
  () => [props.loading, props.loadError],
  () => nextTick(() => setupSortable()),
);

onUnmounted(() => {
  tearDownSortable();
});

defineExpose({
  tearDownSortable,
  setupSortable,
  scrollToEnd,
});
</script>
