<template>
  <div v-if="open" class="print-preview-overlay flex flex-col">
    <div class="print-preview-toolbar min-h-14 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 px-4 py-2 shrink-0">
      <button type="button" class="text-sm font-bold text-slate-600 hover:text-slate-900 shrink-0" @click="emit('close')">
        ← 返回畫布
      </button>
      <div class="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        <span class="text-sm font-black text-slate-800">列印預覽</span>
        <div class="flex items-center bg-slate-100 rounded-lg border border-slate-200 text-xs font-bold">
          <button type="button" class="px-2.5 py-1.5 hover:bg-slate-200 text-slate-500" @click="emit('step-zoom', -0.2)">－</button>
          <span class="px-2 font-mono text-slate-700 min-w-[42px] text-center">{{ zoomPercent }}%</span>
          <button type="button" class="px-2.5 py-1.5 hover:bg-slate-200 text-slate-500" @click="emit('step-zoom', 0.2)">＋</button>
          <button
            type="button"
            class="px-2 py-1.5 hover:bg-slate-200 text-slate-500 border-l border-slate-200"
            title="縮細預覽以睇晒成張 A4"
            @click="emitFitZoom"
          >
            ⊡
          </button>
        </div>
        <div class="flex items-center bg-slate-100 rounded-lg border border-slate-200 text-xs font-bold overflow-hidden">
          <button
            type="button"
            class="print-orient-btn px-2.5 py-1.5 hover:bg-slate-200 text-slate-600"
            :class="{ 'is-active': orientation === 'portrait' }"
            @click="emit('set-orientation', 'portrait')"
          >
            直向
          </button>
          <button
            type="button"
            class="print-orient-btn px-2.5 py-1.5 hover:bg-slate-200 text-slate-600 border-l border-slate-200"
            :class="{ 'is-active': orientation === 'landscape' }"
            @click="emit('set-orientation', 'landscape')"
          >
            橫向
          </button>
        </div>
      </div>
      <button type="button" class="bg-amber-800 hover:bg-amber-900 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm shrink-0" @click="emit('print')">
        列印
      </button>
    </div>
    <div ref="scrollRef" class="print-preview-scroll flex-1 overflow-auto p-6 flex justify-center items-start min-h-0">
      <div
        class="print-preview-viewport shrink-0"
        :style="{ width: `${viewportWidth}px`, height: `${viewportHeight}px` }"
      >
        <div
          class="print-preview-sheet"
          :style="{ transform: `scale(${zoom})`, transformOrigin: 'top left' }"
          v-html="html"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  html: { type: String, default: '' },
  zoom: { type: Number, default: 1 },
  zoomPercent: { type: Number, default: 100 },
  orientation: { type: String, default: 'portrait' },
  pageWidth: { type: Number, default: 756 },
  pageHeight: { type: Number, default: 1085 },
});

const emit = defineEmits(['close', 'step-zoom', 'fit-zoom', 'set-orientation', 'print', 'opened']);

const scrollRef = ref(null);

const viewportWidth = computed(() => Math.ceil(props.pageWidth * props.zoom));
const viewportHeight = computed(() => Math.ceil(props.pageHeight * props.zoom));

function emitOpened() {
  const el = scrollRef.value;
  emit('opened', {
    width: el?.clientWidth ?? 0,
    height: el?.clientHeight ?? 0,
  });
}

function emitFitZoom() {
  const el = scrollRef.value;
  emit('fit-zoom', {
    width: el?.clientWidth ?? 0,
    height: el?.clientHeight ?? 0,
  });
}

watch(() => props.open, async (isOpen) => {
  if (!isOpen) return;
  await nextTick();
  scrollRef.value?.scrollTo(0, 0);
  emitOpened();
});

watch(() => [props.html, props.orientation], async () => {
  if (!props.open) return;
  await nextTick();
  emitOpened();
});
</script>
