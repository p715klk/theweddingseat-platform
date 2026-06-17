<template>
  <div
    v-if="open"
    class="guest-detail-modal fixed inset-0 bg-slate-950/40 z-50 flex items-center justify-center p-4"
    @click.self="emit('close')"
  >
    <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 border border-slate-100">
      <div class="flex justify-between items-start mb-3">
        <h3 class="modal-heading text-base font-black text-slate-900">✏️ 編輯賓客資料</h3>
        <button type="button" class="text-slate-400 hover:text-slate-600 text-xl font-bold" @click="emit('close')">&times;</button>
      </div>

      <div class="modal-form-text space-y-3 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100">
        <div>
          <label class="modal-form-label block text-xs font-bold text-slate-400 mb-1">姓名：</label>
          <input
            v-model="form.name"
            type="text"
            class="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
        </div>
        <div>
          <label class="modal-form-label block text-xs font-bold text-slate-400 mb-1">標籤（可多選）：</label>
            <div id="edit-guest-tags" class="row-multi-tags flex flex-wrap items-center gap-1 min-h-[36px] bg-white border border-slate-200 rounded-lg p-2">
            <span
              v-for="tag in form.group"
              :key="tag"
              class="tag-chip inline-flex items-center gap-1 px-2 py-1 rounded font-bold"
              :class="form.side === '女方' ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'"
            >
              {{ tag }}
              <button
                type="button"
                class="font-black leading-none"
                :class="form.side === '女方' ? 'text-rose-500 hover:text-rose-700' : 'text-blue-500 hover:text-blue-700'"
                @click="removeTag(tag)"
              >
                ×
              </button>
            </span>
            <select
              :value="''"
              class="row-tag-add-select border rounded px-2 py-1 text-xs font-bold focus:bg-white shrink-0"
              :class="form.side === '女方' ? 'border-rose-200 bg-rose-50/20' : 'border-blue-200 bg-blue-50/20'"
              @change="onTagSelectChange"
            >
              <option value="">＋</option>
              <option v-for="cat in availableCategories" :key="cat" :value="cat">{{ cat }}</option>
              <option value="__NEW__" class="text-blue-600 font-bold">+ 新增自訂...</option>
              <option value="__DELETE__" class="text-red-600 font-bold">− 刪除標籤...</option>
            </select>
          </div>
        </div>
        <div>
          <label class="modal-form-label block text-xs font-bold text-slate-400 mb-1">來源：</label>
          <select
            v-model="form.side"
            class="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="男方">男方</option>
            <option value="女方">女方</option>
          </select>
        </div>
        <div class="flex justify-between items-center pt-1">
          <span class="text-slate-400 font-bold">目前席位：</span>
          <span class="font-mono bg-amber-100 px-2 py-0.5 rounded text-amber-800 font-bold">{{ seatLabel }}</span>
        </div>
      </div>

      <div class="space-y-2 mt-4">
        <button
          type="button"
          class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-sm transition disabled:opacity-60"
          :disabled="saving"
          @click="emit('save', { ...form, group: [...form.group] })"
        >
          {{ saving ? '儲存中…' : '💾 儲存並更新資料' }}
        </button>
        <button
          v-if="!fromPool"
          type="button"
          class="w-full py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-sm font-bold transition disabled:opacity-60"
          :disabled="saving"
          @click="emit('remove-from-seat')"
        >
          ↩️ 移出席位 (退回未安排)
        </button>
      </div>
    </div>

    <!-- 新增自訂標籤 -->
    <div
      v-if="showAddCategory"
      class="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
      @click.self="showAddCategory = false"
    >
      <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 border border-gray-100">
        <h3 class="text-base font-bold text-gray-900 mb-2">➕ 新增自訂選項</h3>
        <p class="text-xs text-gray-500 mb-4">請輸入你想加入標籤清單的新選項名稱：</p>
        <input
          v-model="newCategoryName"
          type="text"
          class="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
          @keyup.enter="confirmAddCategory"
        >
        <div class="flex justify-end gap-2">
          <button type="button" class="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold" @click="showAddCategory = false">取消</button>
          <button type="button" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow" @click="confirmAddCategory">確認新增</button>
        </div>
      </div>
    </div>

    <!-- 刪除標籤 -->
    <div
      v-if="showDeleteCategory"
      class="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
      @click.self="showDeleteCategory = false"
    >
      <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 border border-gray-100">
        <h3 class="text-base font-bold text-gray-900 mb-2">🗑️ 刪除標籤</h3>
        <p class="text-xs text-gray-500 mb-3">從標籤清單移除；若有賓客仍使用該標籤，將無法刪除。</p>
        <label class="block text-xs font-bold text-gray-500 mb-1">選擇要刪除的標籤：</label>
        <select v-model="deleteTagName" class="w-full border border-gray-300 rounded-lg p-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-red-500">
          <option v-if="!deletableCategories.length" value="">（無可刪除標籤）</option>
          <option v-for="tag in deletableCategories" :key="tag" :value="tag">{{ tag }}</option>
        </select>
        <p class="text-xs mb-4 text-gray-600" v-html="deleteTagHint" />
        <div class="flex justify-end gap-2">
          <button type="button" class="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold" @click="showDeleteCategory = false">取消</button>
          <button
            type="button"
            class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="!canConfirmDeleteTag"
            @click="confirmDeleteCategory"
          >
            確認刪除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { normalizeTags } from '@/lib/guestUtils';

const props = defineProps({
  open: { type: Boolean, default: false },
  name: { type: String, default: '' },
  side: { type: String, default: '男方' },
  group: { type: Array, default: () => [] },
  seatLabel: { type: String, default: '' },
  fromPool: { type: Boolean, default: false },
  categories: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
  getTagUsage: { type: Function, default: () => [] },
});

const emit = defineEmits(['close', 'save', 'remove-from-seat', 'add-category', 'remove-category']);

const form = reactive({ name: '', side: '男方', group: [] });
const showAddCategory = ref(false);
const newCategoryName = ref('');
const showDeleteCategory = ref(false);
const deleteTagName = ref('');

watch(
  () => [props.open, props.name, props.side, props.group],
  () => {
    if (!props.open) return;
    form.name = props.name;
    form.side = props.side === '女方' ? '女方' : '男方';
    form.group = normalizeTags(props.group);
  },
  { immediate: true },
);

const availableCategories = computed(() =>
  props.categories.filter((cat) => cat && cat !== '未分類' && !form.group.includes(cat)),
);

const deletableCategories = computed(() =>
  props.categories.filter((cat) => cat && cat !== '未分類'),
);

const deleteTagUsers = computed(() => {
  if (!deleteTagName.value) return [];
  return props.getTagUsage(deleteTagName.value) || [];
});

const deleteTagHint = computed(() => {
  if (!deleteTagName.value) return '目前標籤清單為空。';
  const users = deleteTagUsers.value;
  if (users.length > 0) {
    return `<span class="text-red-600 font-bold">尚有 ${users.length} 位賓客使用中：</span>${users.join('、')}`;
  }
  return '<span class="text-green-700 font-bold">無人使用此標籤，可安全刪除。</span>';
});

const canConfirmDeleteTag = computed(() => deleteTagName.value && deleteTagUsers.value.length === 0);

watch(showDeleteCategory, (visible) => {
  if (!visible) return;
  deleteTagName.value = deletableCategories.value[0] || '';
});

function removeTag(tag) {
  form.group = form.group.filter((t) => t !== tag);
}

function onTagSelectChange(e) {
  const val = e.target.value;
  e.target.value = '';
  if (!val) return;
  if (val === '__NEW__') {
    newCategoryName.value = '';
    showAddCategory.value = true;
    return;
  }
  if (val === '__DELETE__') {
    showDeleteCategory.value = true;
    return;
  }
  if (!form.group.includes(val)) {
    form.group.push(val);
  }
}

function confirmAddCategory() {
  const trimmed = newCategoryName.value.trim();
  if (!trimmed) return;
  emit('add-category', trimmed);
  if (!form.group.includes(trimmed)) {
    form.group.push(trimmed);
  }
  showAddCategory.value = false;
  newCategoryName.value = '';
}

function confirmDeleteCategory() {
  if (!canConfirmDeleteTag.value) return;
  emit('remove-category', deleteTagName.value);
  form.group = form.group.filter((t) => t !== deleteTagName.value);
  showDeleteCategory.value = false;
}
</script>
