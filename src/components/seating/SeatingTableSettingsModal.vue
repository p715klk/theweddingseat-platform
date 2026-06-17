<template>
  <div
    v-if="open"
    class="table-settings-modal fixed inset-0 bg-slate-950/40 z-50 flex items-center justify-center p-4"
    @click.self="emit('close')"
  >
    <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 border border-slate-100">
      <h3 class="text-sm font-black text-slate-900 mb-3">⚙️ Table {{ originalTableNum }} 設定</h3>
      <div class="space-y-3">
        <div>
          <label class="block text-[11px] font-bold text-slate-500 mb-1">枱號 (可跳過 4、14 等)：</label>
          <input
            v-model.number="form.tableNum"
            type="number"
            min="1"
            max="99"
            autocomplete="off"
            class="w-full border border-slate-200 rounded-lg p-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
        </div>
        <div>
          <label class="block text-[11px] font-bold text-slate-500 mb-1">枱標籤（顯示於枱中央）：</label>
          <input
            v-model="form.label"
            type="text"
            placeholder="例如：主家席、父親朋友、母親朋友"
            autocomplete="off"
            class="w-full border border-slate-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
        </div>
        <div>
          <label class="block text-[11px] font-bold text-slate-500 mb-1">此桌座位數量 (人數上限)：</label>
          <input
            v-model.number="form.maxSeats"
            type="number"
            :min="minMaxSeats"
            max="99"
            class="w-full border border-slate-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
        </div>
      </div>
      <div class="flex justify-between items-center mt-5 pt-3 border-t border-slate-100">
        <button
          type="button"
          class="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-md text-xs font-bold transition disabled:opacity-60"
          :disabled="busy"
          @click="emit('delete')"
        >
          🗑️ 刪除此桌
        </button>
        <div class="flex gap-2">
          <button
            type="button"
            class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-bold disabled:opacity-60"
            :disabled="busy"
            @click="emit('close')"
          >
            取消
          </button>
          <button
            type="button"
            class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-bold disabled:opacity-60"
            :disabled="busy"
            @click="emit('save', { tableNum: form.tableNum, label: form.label, maxSeats: form.maxSeats })"
          >
            {{ saving ? '儲存中…' : '儲存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, watch } from 'vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  originalTableNum: { type: String, default: '' },
  tableNum: { type: [String, Number], default: '' },
  label: { type: String, default: '' },
  maxSeats: { type: Number, default: 12 },
  minMaxSeats: { type: Number, default: 1 },
  saving: { type: Boolean, default: false },
  deleting: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'save', 'delete']);

const form = reactive({
  tableNum: 1,
  label: '',
  maxSeats: 12,
});

const busy = computed(() => props.saving || props.deleting);

watch(
  () => [props.open, props.tableNum, props.label, props.maxSeats],
  () => {
    if (!props.open) return;
    form.tableNum = parseInt(String(props.tableNum), 10) || 1;
    form.label = props.label || '';
    form.maxSeats = props.maxSeats || props.minMaxSeats || 12;
  },
  { immediate: true },
);
</script>
