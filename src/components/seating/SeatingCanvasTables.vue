<template>
  <div
    id="main-canvas"
    class="workspace-canvas"
    :style="canvasStyle"
    @dragover="allowCanvasDrop($event)"
  >
    <SeatingTableUnit
      v-for="table in tables"
      :key="table.num"
      :table="table"
      :zoom="zoom"
      :dragging="draggingTableNum === table.num"
      :flashing="flashingTableNum === table.num"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import SeatingTableUnit from '@/components/seating/SeatingTableUnit.vue';
import { allowCanvasDrop } from '@/seating/seatingEngine';

const props = defineProps({
  tables: { type: Array, default: () => [] },
  panX: { type: Number, default: -900 },
  panY: { type: Number, default: -600 },
  zoom: { type: Number, default: 1 },
  draggingTableNum: { type: String, default: '' },
  flashingTableNum: { type: String, default: '' },
});

const canvasStyle = computed(() => ({
  transform: `translate(${props.panX}px, ${props.panY}px)`,
  '--zoom': props.zoom,
}));
</script>
