<template>
  <div id="main-canvas" class="workspace-canvas" @dragover="allowCanvasDrop($event)">
    <SeatingTableUnit
      v-for="table in tables"
      :key="table.num"
      :table="table"
      :zoom="zoom"
      :dragging="draggingTableNum === table.num"
    />
  </div>
</template>

<script setup>
import SeatingTableUnit from '@/components/seating/SeatingTableUnit.vue';
import { allowCanvasDrop } from '@/seating/seatingEngine';

defineProps({
  tables: { type: Array, default: () => [] },
  zoom: { type: Number, default: 1 },
  draggingTableNum: { type: String, default: '' },
});
</script>
