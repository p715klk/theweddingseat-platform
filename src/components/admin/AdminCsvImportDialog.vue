<template>
  <div
    v-if="open"
    class="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
    @click.self="emit('cancel')"
  >
    <div class="bg-white rounded-xl shadow-xl max-w-2xl w-full border border-gray-100 max-h-[90vh] flex flex-col">
      <div class="p-5 border-b border-gray-100 flex-shrink-0">
        <h3 class="text-base font-bold text-gray-900 mb-1">📥 匯入 CSV 預覽</h3>
        <p class="text-xs text-gray-500">{{ fileName }}</p>
      </div>

      <div class="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
        <fieldset class="space-y-2">
          <legend class="text-xs font-bold text-gray-600 mb-1">匯入模式</legend>
          <label class="flex items-start gap-2 p-2 rounded-lg border border-green-200 bg-green-50/60 cursor-pointer">
            <input v-model="mode" type="radio" value="merge" class="mt-0.5" />
            <span class="text-xs leading-relaxed">
              <span class="font-bold text-gray-900">合併匯入（建議）</span><br />
              <span class="text-gray-600">以「姓名 + 來源 + 標籤」配對；更新 CSV 有嘅人、加入新賓客，唔會刪走 CSV 冇寫到嘅人。</span>
            </span>
          </label>
          <label class="flex items-start gap-2 p-2 rounded-lg border border-red-200 bg-red-50/40 cursor-pointer">
            <input v-model="mode" type="radio" value="replace" class="mt-0.5" />
            <span class="text-xs leading-relaxed">
              <span class="font-bold text-gray-900">完全取代</span><br />
              <span class="text-gray-600">用 CSV 成個取代名單；CSV 冇寫到嘅人會被刪除。</span>
            </span>
          </label>
        </fieldset>

        <div v-if="plan" class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div class="rounded-lg bg-gray-50 p-2 border"><span class="text-gray-500">CSV</span><br /><strong>{{ plan.stats.csvTotal }}</strong></div>
          <div class="rounded-lg bg-green-50 p-2 border border-green-100"><span class="text-gray-500">新增</span><br /><strong>{{ plan.stats.added }}</strong></div>
          <div class="rounded-lg bg-blue-50 p-2 border border-blue-100"><span class="text-gray-500">更新</span><br /><strong>{{ plan.stats.updated }}</strong></div>
          <div class="rounded-lg bg-gray-50 p-2 border"><span class="text-gray-500">結果總數</span><br /><strong>{{ plan.stats.resultTotal }}</strong></div>
        </div>

        <div
          v-if="plan?.duplicates?.length"
          class="text-xs rounded-lg border border-amber-200 bg-amber-50 text-amber-900 p-3"
        >
          ⚠️ CSV 內有 {{ plan.duplicates.length }} 組重複（姓名+來源+標籤相同），已保留最後一行。
        </div>

        <div v-if="plan" class="space-y-2 text-xs text-gray-600">
          <p v-if="mode === 'merge'">保留（CSV 冇寫到）：{{ plan.stats.kept }} 位</p>
          <p v-else>刪除（CSV 冇寫到）：{{ plan.stats.removed }} 位</p>
          <p>已分配枱位：{{ plan.stats.assigned }} · 未分配：{{ plan.stats.unassigned }}</p>
        </div>
      </div>

      <div class="p-5 border-t border-gray-100 flex justify-end gap-2 flex-shrink-0">
        <button type="button" class="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold" @click="emit('cancel')">
          取消
        </button>
        <button
          type="button"
          class="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow disabled:opacity-60"
          :disabled="!plan || applying"
          @click="confirm"
        >
          {{ applying ? '匯入中…' : '確認匯入' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  fileName: { type: String, default: '' },
  importedGuests: { type: Array, default: () => [] },
  previewFn: { type: Function, required: true },
  applying: { type: Boolean, default: false },
});

const emit = defineEmits(['cancel', 'confirm']);

const mode = ref('merge');
const plan = ref(null);

watch(
  [() => props.open, () => props.importedGuests, mode],
  () => {
    if (!props.open || !props.importedGuests.length) {
      plan.value = null;
      return;
    }
    plan.value = props.previewFn(props.importedGuests, mode.value);
  },
  { immediate: true },
);

function confirm() {
  if (plan.value) emit('confirm', plan.value);
}
</script>
