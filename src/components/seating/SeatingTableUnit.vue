<template>
  <div
    class="draggable-table"
    :class="{ 'is-dragging': dragging }"
    :data-table="table.num"
    :style="{
      left: `${table.baseX * zoom}px`,
      top: `${table.baseY * zoom}px`,
    }"
  >
    <div
      class="table-plate"
      :ref="bindPlate"
      :style="{ '--guest-size': `${table.guestSize}px` }"
    >
      <div
        v-for="seat in table.seats"
        :key="`${seat.index}-${seat.guest?.name || 'empty'}`"
        :ref="(el) => bindSeat(el, seat)"
        class="seat-slot"
        :class="seat.guest ? ['guest-seat-circle', seat.guest.sideClass] : ['seat-empty']"
        :style="{
          left: `calc(${seat.x}px * var(--zoom))`,
          top: `calc(${seat.y}px * var(--zoom))`,
        }"
        :data-table-num="table.num"
        :data-seat-index="seat.index"
      >
        <span
          v-if="seat.guest"
          :class="seat.guest.nameClass"
          :title="seat.guest.name"
          v-html="seat.guest.displayHtml"
        />
        <span v-else>+</span>
      </div>
      <div v-html="table.hubRingHtml" />
      <div class="hub-center" :ref="bindHub">
        <span ref="hubTitleRef" class="hub-title">Table {{ table.num }}</span>
        <span v-if="table.label" class="hub-category">{{ table.label }}</span>
        <span class="hub-num">{{ table.filled }} ppl</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue';
import { bindTablePlateDrag, bindSeatSlot, bindTableHub } from '@/seating/seatingEngine';

const props = defineProps({
  table: { type: Object, required: true },
  zoom: { type: Number, default: 1 },
  dragging: { type: Boolean, default: false },
});

const hubTitleRef = ref(null);
const hubCenterEl = ref(null);

function bindPlate(el) {
  if (!el) return;
  bindTablePlateDrag(el, props.table.num);
}

function bindSeat(el, seat) {
  if (!el) return;
  bindSeatSlot(el, props.table.num, seat.index, seat.guest);
}

function bindHub(el) {
  hubCenterEl.value = el;
  void mountHubInteractions();
}

async function mountHubInteractions() {
  await nextTick();
  if (!hubCenterEl.value) return;
  bindTableHub(
    hubCenterEl.value,
    props.table.num,
    props.table.maxSeats,
    hubTitleRef.value,
  );
}

watch(() => props.table.num, () => {
  if (hubCenterEl.value) hubCenterEl.value.dataset.hubBound = '';
  void mountHubInteractions();
});
</script>
