<template>
  <tr
    :class="guest.isCanceled
      ? 'row-guest-canceled hover:bg-red-50/60 transition bg-red-50/40'
      : 'hover:bg-gray-50 transition bg-white'"
  >
    <td class="py-2 px-1 text-center font-mono text-gray-400 font-bold row-sort-num row-sort-cell">{{ index + 1 }}</td>
    <td
      class="py-2 px-1 text-center text-gray-400 text-base select-none row-drag-cell"
      :class="guest.isCanceled ? '' : 'drag-handle cursor-row-resize'"
    >
      <span v-if="guest.isCanceled" class="text-gray-300 text-sm" title="已取消賓客不可拖動排序">🔒</span>
      <template v-else>☰</template>
    </td>
    <td class="py-2 px-1 row-table-cell">
      <div class="row-table-wrap">
        <input
          :value="guest.table === '' ? '' : guest.table"
          type="number"
          min="1"
          max="99"
          placeholder="—"
          class="row-table-input font-mono font-bold"
          @input="onTableInput"
        />
        <div class="row-table-spin-btns">
          <button type="button" tabindex="-1" class="row-table-spin-up" aria-label="增加" @click="stepTable(1)">▲</button>
          <button type="button" tabindex="-1" class="row-table-spin-down" aria-label="減少" @click="stepTable(-1)">▼</button>
        </div>
      </div>
    </td>
    <td class="py-2 px-2 text-center row-seat-txt-cell">
      <span v-if="guest.table === '' || guest.table == null" class="text-gray-400">未安排</span>
      <span
        v-else-if="guest.isCanceled"
        class="row-seat-released inline-flex items-center gap-0.5 font-mono font-bold text-red-500 flex-wrap justify-center"
      >
        第 <span class="row-table-display-num">{{ guest.table }}</span> 桌 -
        <span title="簽到頁已取消，座位已釋放；原座位資料仍保留於 Firebase">已釋放</span>
      </span>
      <span
        v-else
        class="row-seat-label inline-flex items-center gap-0.5 font-mono font-bold text-gray-600 flex-nowrap justify-center"
      >
        第 <span class="row-table-display-num">{{ guest.table }}</span> 桌 - 第
        <div class="row-seat-wrap">
          <input
            :value="guest.sort"
            type="number"
            :min="1"
            :max="maxSeats"
            class="row-seat-input font-mono font-bold"
            @input="onSeatInput"
          />
          <div class="row-seat-spin-btns">
            <button type="button" tabindex="-1" class="row-seat-spin-up" aria-label="增加" @click="stepSeat(1)">▲</button>
            <button type="button" tabindex="-1" class="row-seat-spin-down" aria-label="減少" @click="stepSeat(-1)">▼</button>
          </div>
        </div>
        位
      </span>
    </td>
    <td class="py-2 px-2">
      <div v-if="guest.isCanceled" class="flex flex-col gap-0.5">
        <input
          v-model="guest.name"
          type="text"
          class="w-full border border-red-200 rounded p-1 font-bold bg-transparent focus:bg-white row-name-input text-gray-500"
          @input="emitDirty"
        />
        <span class="row-cancel-badge text-[10px] font-bold text-red-600 leading-tight">❌ 已取消（簽到頁）</span>
      </div>
      <input
        v-else
        v-model="guest.name"
        type="text"
        placeholder="請輸入姓名"
        class="w-full border border-gray-200 rounded p-1 font-bold bg-transparent focus:bg-white row-name-input"
        @input="emitDirty"
      />
    </td>
    <td class="py-2 px-1 row-side-cell">
      <select
        v-model="guest.side"
        class="w-full border border-gray-200 rounded p-1 font-bold bg-transparent focus:bg-white row-side-select"
        @change="emitDirty"
      >
        <option value="男方">男方</option>
        <option value="女方">女方</option>
      </select>
    </td>
    <td class="py-2 px-2 align-middle">
      <AdminTagCell
        :tags="guest.group"
        :categories="categories"
        :side="guest.side"
        @update:tags="onTagsUpdate"
        @add-category="(name) => emit('add-category', name)"
        @request-delete-category="emit('request-delete-category')"
      />
    </td>
    <td class="py-2 px-2 text-center">
      <button
        type="button"
        class="text-red-500 hover:text-red-700 font-bold p-1 transition whitespace-nowrap"
        @click="emit('remove')"
      >
        ❌ 刪除
      </button>
    </td>
  </tr>
</template>

<script setup>
import { computed } from 'vue';
import AdminTagCell from '@/components/admin/AdminTagCell.vue';

const props = defineProps({
  guest: { type: Object, required: true },
  index: { type: Number, required: true },
  categories: { type: Array, default: () => [] },
  getMaxSeats: { type: Function, required: true },
});

const emit = defineEmits(['dirty', 'table-change', 'seat-change', 'remove', 'add-category', 'request-delete-category']);

const maxSeats = computed(() => {
  if (props.guest.table === '' || props.guest.table == null) return 99;
  return props.getMaxSeats(props.guest.table);
});

function emitDirty() {
  emit('dirty');
}

function onTableInput(e) {
  const raw = e.target.value.trim();
  props.guest.table = raw === '' ? '' : parseInt(raw, 10);
  if (raw !== '' && Number.isNaN(props.guest.table)) props.guest.table = '';
  emit('table-change', props.guest);
}

function stepTable(delta) {
  const cur = parseInt(props.guest.table, 10);
  let v = Number.isNaN(cur) ? (delta > 0 ? 1 : 0) : cur + delta;
  if (v < 1) return;
  props.guest.table = Math.min(99, v);
  emit('table-change', props.guest);
}

function onSeatInput(e) {
  emit('seat-change', props.guest, e.target.value);
}

function stepSeat(delta) {
  const min = 1;
  const max = maxSeats.value;
  let v = parseInt(props.guest.sort, 10);
  if (Number.isNaN(v)) v = min;
  else v = Math.min(max, Math.max(min, v + delta));
  props.guest.sort = v;
  emit('seat-change', props.guest, v);
}

function onTagsUpdate(tags) {
  props.guest.group = tags;
  emitDirty();
}
</script>
