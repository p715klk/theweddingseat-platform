<template>
  <div
    class="row-multi-tags flex flex-wrap items-center gap-1"
    :class="{ 'row-multi-tags-disabled': disabled }"
    data-column-key="group"
  >
    <span
      v-for="tag in tags"
      :key="tag"
      class="tag-chip inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold"
      :class="disabled
        ? 'bg-gray-100 text-gray-400'
        : (side === '女方' ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800')"
    >
      {{ tag }}
      <button
        v-if="!disabled"
        type="button"
        class="font-black leading-none"
        :class="side === '女方' ? 'text-rose-500 hover:text-rose-700' : 'text-blue-500 hover:text-blue-700'"
        @click="removeTag(tag)"
      >
        ×
      </button>
    </span>
    <select
      v-if="!disabled"
      :value="''"
      class="row-tag-add-select row-tag-add-select-group border rounded px-1 py-0.5 font-bold focus:bg-white shrink-0"
      :class="side === '女方' ? 'border-rose-200 bg-rose-50/20' : 'border-blue-200 bg-blue-50/20'"
      @change="onSelectChange"
    >
      <option value="">＋</option>
      <option v-for="cat in availableCategories" :key="cat" :value="cat">{{ cat }}</option>
      <option value="__NEW__" class="text-blue-600 font-bold">+ 新增自訂...</option>
      <option value="__DELETE__" class="text-red-600 font-bold">− 刪除標籤...</option>
    </select>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { normalizeTags } from '@/lib/guestUtils';

const props = defineProps({
  tags: { type: Array, default: () => [] },
  categories: { type: Array, default: () => [] },
  side: { type: String, default: '男方' },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(['update:tags', 'add-category', 'request-delete-category']);

const availableCategories = computed(() =>
  props.categories.filter((cat) => !normalizeTags(props.tags).includes(cat)),
);

function removeTag(tag) {
  if (props.disabled) return;
  emit('update:tags', normalizeTags(props.tags).filter((t) => t !== tag));
}

function onSelectChange(e) {
  if (props.disabled) return;
  const val = e.target.value;
  e.target.value = '';
  if (!val) return;
  if (val === '__NEW__') {
    const name = window.prompt('請輸入你想加入標籤清單的新選項名稱：');
    if (name?.trim()) {
      emit('add-category', name.trim());
      emit('update:tags', [...normalizeTags(props.tags), name.trim()]);
    }
    return;
  }
  if (val === '__DELETE__') {
    emit('request-delete-category');
    return;
  }
  if (!normalizeTags(props.tags).includes(val)) {
    emit('update:tags', [...normalizeTags(props.tags), val]);
  }
}
</script>
