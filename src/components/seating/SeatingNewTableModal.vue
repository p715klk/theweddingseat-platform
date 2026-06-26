<template>
  <div
    v-if="open"
    class="new-table-modal fixed inset-0 bg-slate-950/40 z-50 flex items-center justify-center p-4"
    @click.self="emit('close')"
  >
    <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 border border-slate-100">
      <h3 class="text-sm font-black text-slate-900 mb-3">➕ 新增圓枱</h3>
      <div class="space-y-3">
        <div>
          <label class="block text-[11px] font-bold text-slate-500 mb-1">桌號（只可輸入數字）：</label>
          <input
            ref="tableNumInputRef"
            v-model="form.tableNum"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            autocomplete="off"
            placeholder="例如：1、13、18"
            class="w-full border border-slate-200 rounded-lg p-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            @input="onTableNumInput"
          >
        </div>
        <div>
          <label class="block text-[11px] font-bold text-slate-500 mb-1">此桌座位數量 (人數上限)：</label>
          <input
            v-model="form.maxSeats"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            autocomplete="off"
            class="w-full border border-slate-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            @input="onMaxSeatsInput"
          >
        </div>
      </div>
      <div class="flex justify-end gap-2 mt-5 pt-3 border-t border-slate-100">
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
          @click="submit"
        >
          {{ creating ? '新增中…' : '新增' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  tableNum: { type: [String, Number], default: '' },
  maxSeats: { type: Number, default: 12 },
  creating: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'create']);

const tableNumInputRef = ref(null);

const form = reactive({
  tableNum: '',
  maxSeats: '12',
});

const busy = computed(() => props.creating);

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function onTableNumInput(e) {
  const cleaned = digitsOnly(e.target.value);
  form.tableNum = cleaned;
  if (e.target.value !== cleaned) e.target.value = cleaned;
}

function onMaxSeatsInput(e) {
  const cleaned = digitsOnly(e.target.value);
  form.maxSeats = cleaned;
  if (e.target.value !== cleaned) e.target.value = cleaned;
}

function submit() {
  emit('create', {
    tableNum: form.tableNum,
    maxSeats: parseInt(form.maxSeats, 10) || 12,
  });
}

watch(
  () => [props.open, props.tableNum, props.maxSeats],
  async () => {
    if (!props.open) return;
    form.tableNum = digitsOnly(props.tableNum);
    form.maxSeats = digitsOnly(props.maxSeats || 12) || '12';
    await nextTick();
    tableNumInputRef.value?.focus();
  },
  { immediate: true },
);
</script>
