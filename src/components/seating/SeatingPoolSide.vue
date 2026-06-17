<template>
  <div
    class="p-4 space-y-4 min-h-[60px]"
    @dragover.prevent
  >
    <div v-if="!section.count" class="text-center text-slate-400 text-sm py-4 font-medium">
      {{ section.emptyMessage }}
    </div>
    <div
      v-for="group in section.groups"
      :key="group.name"
      class="pool-group bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm w-full"
    >
      <h4 class="pool-group-title text-xs font-bold text-slate-400 mb-2.5 border-b border-slate-100 pb-1">
        🏷️ {{ group.name }}
      </h4>
      <div class="grid grid-cols-2 gap-2">
        <div
          v-for="item in group.items"
          :key="item.id || `${item.originalIndex}-${item.name}`"
          :ref="(el) => bindChip(el, item)"
          class="pool-guest-chip text-sm p-2.5 rounded-lg border text-center font-bold truncate transition-all hover:translate-y-[-1px] cursor-grab active:cursor-grabbing"
          :class="item.chipClass"
        >
          {{ item.name }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { bindPoolGuestChip } from '@/seating/seatingEngine';

defineProps({
  section: {
    type: Object,
    default: () => ({ groups: [], count: 0, emptyMessage: '' }),
  },
});

function bindChip(el, item) {
  if (!el || !item?.name) return;
  bindPoolGuestChip(el, item.originalIndex, item.id, item.name);
}
</script>
