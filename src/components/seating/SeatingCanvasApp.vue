<template>
  <div id="seating-app" class="h-full flex flex-col overflow-hidden">
    <div
      v-if="initError"
      class="fixed inset-0 z-[20000] bg-slate-900/80 flex items-center justify-center p-4"
    >
      <div class="bg-white rounded-xl shadow-xl max-w-md w-full p-5 border border-rose-200">
        <h2 class="text-base font-bold text-rose-700 mb-2">畫布載入失敗</h2>
        <p class="text-sm text-gray-600 mb-4">{{ initError }}</p>
        <button
          type="button"
          class="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold"
          @click="mountEngine"
        >
          重試
        </button>
      </div>
    </div>
    <header class="bg-white text-slate-800 h-14 px-4 shadow-sm flex justify-between items-center shrink-0 border-b border-slate-200 z-30">
      <div class="flex items-center gap-3">
        <h1 class="text-base font-black tracking-wider text-slate-900 flex items-center gap-1.5">
          <span class="text-xl">🦢</span> 可視化圓枱排位畫布
        </h1>
        <div class="global-stats text-[11px] bg-slate-100 px-2.5 py-1 rounded-full text-slate-600 font-bold">{{ globalStatsText }}</div>
      </div>
      <div class="header-actions flex items-center">
        <div class="header-action-group">
          <div class="flex items-center bg-slate-50 border border-slate-200 rounded-lg overflow-hidden h-8 text-xs">
            <button type="button" class="px-2.5 hover:bg-slate-200 font-bold text-slate-500" @click="zoomCanvas(0.9)">－</button>
            <span id="zoom-percent" class="px-2 font-mono text-slate-700 font-bold min-w-[45px] text-center">100%</span>
            <button type="button" class="px-2.5 hover:bg-slate-200 font-bold text-slate-500" @click="zoomCanvas(1.1)">＋</button>
          </div>
          <button
            type="button"
            class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 transition"
            title="將視野置中到所有枱的中間點（保持縮放）"
            @click="centerViewOnTables()"
          >
            🎯<span class="hide-mobile"> 置中</span>
          </button>
          <div class="relative" id="find-table-wrap">
            <button
              type="button"
              id="btn-find-table"
              class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 transition"
              title="搵枱並飛到該枱位置"
              @click="toggleFindTableMenu($event)"
            >
              🔍<span class="hide-mobile"> 搵枱</span>
            </button>
            <div id="find-table-menu" class="hidden absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-xs font-bold overflow-hidden min-w-[9rem]">
              <p v-if="!findTableItems.length" class="px-3 py-2 text-slate-400 font-bold text-[11px]">未有圓枱</p>
              <button
                v-for="item in findTableItems"
                :key="item.num"
                type="button"
                class="find-table-item w-full text-left px-3 py-2 hover:bg-indigo-50 active:bg-indigo-100 text-slate-700 border-t border-slate-100 first:border-t-0"
                @click="onFindTablePick(item.num)"
              >
                <span class="font-black">Table {{ item.num }}</span>
                <span v-if="item.label" class="block text-[10px] font-semibold text-slate-400 truncate max-w-[140px]">{{ item.label }}</span>
              </button>
            </div>
          </div>
        </div>
        <div class="header-action-group">
          <button
            type="button"
            class="hide-mobile bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition"
            @click="createNewTableAction()"
          >
            ➕ 新增圓枱
          </button>
          <button
            type="button"
            id="btn-lock-tables"
            class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 transition"
            :class="{ 'is-active': tablesLocked }"
            :title="tablesLocked ? '枱位已鎖定，點擊解鎖' : '鎖定枱位（防止拖動）'"
            @click="toggleTablePositionLock()"
          >
            {{ tablesLocked ? '🔒' : '🔓' }}<span class="hide-mobile">{{ tablesLocked ? ' 已鎖' : ' 鎖枱' }}</span>
          </button>
        </div>
        <div class="header-action-group">
          <div class="relative" id="print-menu-wrap">
            <button
              ref="printMenuBtnRef"
              type="button"
              id="btn-print-menu"
              class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 transition"
              @click="togglePrintMenu($event)"
            >
              🖨️<span class="hide-mobile"> 打印</span>
            </button>
            <div
              v-show="printMenuOpen"
              class="print-menu absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-xs font-bold overflow-hidden"
              :class="{ 'is-fixed': printMenuFixed }"
              :style="printMenuStyle"
            >
              <button type="button" class="w-full text-left px-3 py-2 hover:bg-slate-50 active:bg-slate-100 text-slate-700" @click="onPrintMenuSelect('canvas')">🖼️ 打印畫面（全部枱位）</button>
              <button type="button" class="w-full text-left px-3 py-2 hover:bg-slate-50 active:bg-slate-100 text-slate-700 border-t border-slate-100" @click="onPrintMenuSelect('guest-list')">📋 打印圓枱名單（文字版）</button>
            </div>
          </div>
          <RouterLink
            id="link-back-admin"
            :to="adminRoute"
            class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 transition"
          >
            📋<span class="hide-mobile"> 返回</span>
          </RouterLink>
          <button
            type="button"
            class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 transition"
            @click="emit('logout')"
          >
            登出
          </button>
        </div>
      </div>
    </header>

    <div class="flex-1 relative overflow-hidden w-full bg-slate-100 min-h-0">
      <main class="absolute inset-0 overflow-hidden" id="canvas-viewport">
        <div
          class="workspace-canvas"
          id="main-canvas"
          @dragover="allowDrop($event)"
        />
      </main>

      <aside id="sidebar-panel" class="absolute left-0 top-0 bottom-0 z-20">
        <div
          id="sidebar-content"
          class="bg-white border-r border-slate-200 flex flex-col h-full shadow-xl overflow-hidden w-[320px]"
          @dragover="allowDrop($event)"
          @drop="handleDropTrash($event)"
        >
          <div class="p-4 bg-white shrink-0 border-b border-slate-100">
            <h2 class="sidebar-title text-xl font-black text-slate-800 tracking-wide">未安排名單</h2>
          </div>
          <div
            class="flex-1 overflow-y-auto bg-slate-50/40 no-scrollbar pb-12"
            id="single-scroll-pool"
            @dragover="allowDrop($event)"
            @drop="handleDropTrash($event)"
          >
            <div class="px-4 py-2 bg-blue-50/60 flex items-center sticky top-0 border-b border-blue-100 z-10 shadow-sm">
              <span class="pool-section-label text-sm font-black text-blue-700 tracking-wider">♂️ 男方名單</span>
            </div>
            <div id="pool-male" class="p-4 space-y-4 min-h-[60px]" />
            <div class="px-4 py-2 bg-rose-50/60 flex items-center sticky top-0 border-b border-rose-100 border-t border-slate-100 z-10 shadow-sm">
              <span class="pool-section-label text-sm font-black text-rose-700 tracking-wider">♀️ 女方名單</span>
            </div>
            <div id="pool-female" class="p-4 space-y-4 min-h-[60px]" />
          </div>
        </div>
        <button
          id="sidebar-toggle-btn"
          type="button"
          class="absolute -right-5 top-1/2 -translate-y-1/2 w-5 h-20 bg-indigo-600 text-white border border-indigo-500 rounded-r-xl shadow-md flex items-center justify-center font-black text-[10px] hover:bg-indigo-700 z-30"
          @click="toggleSidebar()"
        >
          <span id="sidebar-toggle-icon">◀</span>
        </button>
      </aside>
    </div>

    <SeatingGuestEditModal
      :open="guestModal.open"
      :name="guestModal.name"
      :side="guestModal.side"
      :group="guestModal.group"
      :seat-label="guestModal.seatLabel"
      :from-pool="guestModal.fromPool"
      :categories="seatingCategories"
      :saving="guestModalSaving"
      :get-tag-usage="getSeatingGuestsUsingTag"
      @close="closeGuestModal()"
      @save="onGuestModalSave"
      @remove-from-seat="onGuestModalRemove"
      @add-category="onGuestAddCategory"
      @remove-category="onGuestRemoveCategory"
    />

    <SeatingTableSettingsModal
      :open="tableSettingsModal.open"
      :original-table-num="tableSettingsModal.originalTableNum"
      :table-num="tableSettingsModal.tableNum"
      :label="tableSettingsModal.label"
      :max-seats="tableSettingsModal.maxSeats"
      :min-max-seats="tableSettingsModal.minMaxSeats"
      :saving="tableSettingsSaving"
      :deleting="tableSettingsDeleting"
      @close="closeSettingsModal()"
      @save="onTableSettingsSave"
      @delete="onTableSettingsDelete"
    />

    <SeatingPrintPreview
      :open="printPreview.open"
      :html="printPreview.html"
      :zoom="printPreview.zoom"
      :zoom-percent="printPreview.zoomPercent"
      :orientation="printPreview.orientation"
      :page-width="printPreview.pageWidth"
      :page-height="printPreview.pageHeight"
      @close="closePrintPreview()"
      @step-zoom="stepPrintPreviewZoom"
      @fit-zoom="fitPrintPreviewZoom"
      @set-orientation="setPrintOrientation"
      @print="executePrintPreview()"
      @opened="autoFitPrintPreviewOnOpen"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useTenant } from '@/composables/useTenant';
import SeatingGuestEditModal from '@/components/seating/SeatingGuestEditModal.vue';
import SeatingTableSettingsModal from '@/components/seating/SeatingTableSettingsModal.vue';
import SeatingPrintPreview from '@/components/seating/SeatingPrintPreview.vue';
import {
  initSeatingEngine,
  destroySeatingEngine,
  zoomCanvas,
  centerViewOnTables,
  toggleFindTableMenu,
  flyToTable,
  createNewTableAction,
  toggleTablePositionLock,
  printCanvasView,
  printGuestListView,
  toggleSidebar,
  closeGuestModal,
  saveGuestChangesAction,
  removeGuestFromSeatAction,
  getSeatingGuestsUsingTag,
  addSeatingCategory,
  removeSeatingCategory,
  closeSettingsModal,
  saveTableSettingsAction,
  deleteTableAction,
  closePrintPreview,
  stepPrintPreviewZoom,
  fitPrintPreviewZoom,
  autoFitPrintPreviewOnOpen,
  setPrintOrientation,
  executePrintPreview,
  allowDrop,
  handleDropTrash,
} from '@/seating/seatingEngine';
import '@/assets/seating-canvas.css';

const props = defineProps({
  slug: { type: String, required: true },
});

const emit = defineEmits(['logout']);

const { tenantRef, tenantId } = useTenant();
const initError = ref('');
const globalStatsText = ref('載入中...');
const findTableItems = ref([]);
const tablesLocked = ref(false);
const seatingCategories = ref([]);
const guestModalSaving = ref(false);
const tableSettingsSaving = ref(false);
const tableSettingsDeleting = ref(false);
const guestModal = ref({
  open: false,
  name: '',
  side: '男方',
  group: [],
  seatLabel: '',
  fromPool: false,
});
const tableSettingsModal = ref({
  open: false,
  originalTableNum: '',
  tableNum: '',
  label: '',
  maxSeats: 12,
  minMaxSeats: 1,
});
const printPreview = ref({
  open: false,
  html: '',
  zoom: 1,
  zoomPercent: 100,
  orientation: 'portrait',
  pageWidth: 756,
  pageHeight: 1085,
});
const printMenuOpen = ref(false);
const printMenuFixed = ref(false);
const printMenuStyle = ref({});
const printMenuBtnRef = ref(null);
let printMenuIgnoreCloseUntil = 0;

const adminRoute = computed(() => `/p/${props.slug}/admin`);

function togglePrintMenu(e) {
  e?.stopPropagation();
  const willOpen = !printMenuOpen.value;
  printMenuOpen.value = willOpen;
  if (willOpen) {
    printMenuIgnoreCloseUntil = Date.now() + 400;
    if (window.innerWidth <= 768) {
      printMenuFixed.value = true;
      nextTick(() => {
        const rect = printMenuBtnRef.value?.getBoundingClientRect();
        if (rect) {
          printMenuStyle.value = {
            top: `${rect.bottom + 4}px`,
            right: `${Math.max(8, window.innerWidth - rect.right)}px`,
          };
        }
      });
    } else {
      printMenuFixed.value = false;
      printMenuStyle.value = {};
    }
  } else {
    closePrintMenu();
  }
}

function closePrintMenu() {
  printMenuOpen.value = false;
  printMenuFixed.value = false;
  printMenuStyle.value = {};
}

function onPrintMenuSelect(action) {
  printMenuIgnoreCloseUntil = Date.now() + 600;
  closePrintMenu();
  if (action === 'canvas') printCanvasView();
  else if (action === 'guest-list') printGuestListView();
}

function onDocumentClick(e) {
  if (Date.now() < printMenuIgnoreCloseUntil) return;
  if (!e.target.closest('#print-menu-wrap')) closePrintMenu();
}

function onFindTablePick(tableNum) {
  flyToTable(String(tableNum));
}

async function onGuestModalSave(payload) {
  guestModalSaving.value = true;
  try {
    await saveGuestChangesAction(payload);
  } finally {
    guestModalSaving.value = false;
  }
}

function onGuestModalRemove() {
  removeGuestFromSeatAction();
}

async function onGuestAddCategory(name) {
  await addSeatingCategory(name);
}

async function onGuestRemoveCategory(tag) {
  const ok = await removeSeatingCategory(tag);
  if (ok) {
    window.alert(`✅ 已刪除標籤「${tag}」`);
  }
}

async function onTableSettingsSave(payload) {
  tableSettingsSaving.value = true;
  try {
    await saveTableSettingsAction(payload);
  } finally {
    tableSettingsSaving.value = false;
  }
}

async function onTableSettingsDelete() {
  const num = tableSettingsModal.value.originalTableNum;
  if (!num) return;
  const ok = window.confirm(`⚠️ 確定要刪除第 ${num} 桌嗎？所有人會退回左側。`);
  if (!ok) return;
  tableSettingsDeleting.value = true;
  try {
    await deleteTableAction();
  } finally {
    tableSettingsDeleting.value = false;
  }
}

function prefetchAdminRoute() {
  void import('@/views/AdminView.vue');
}

function mountEngine() {
  if (!tenantId.value) return;
  initError.value = '';
  try {
    initSeatingEngine({
      tenantRef,
      slug: props.slug,
      hooks: {
        onFindTableItemsChange(items) {
          findTableItems.value = items;
        },
        onTableLockChange(locked) {
          tablesLocked.value = locked;
        },
        onGuestModalChange(state) {
          if (!state?.open) {
            guestModal.value = { ...guestModal.value, open: false };
            return;
          }
          guestModal.value = {
            open: true,
            name: state.name || '',
            side: state.side || '男方',
            group: state.group || [],
            seatLabel: state.seatLabel || '',
            fromPool: !!state.fromPool,
          };
        },
        onCategoryPoolChange(categories) {
          seatingCategories.value = categories;
        },
        onTableSettingsModalChange(state) {
          if (!state?.open) {
            tableSettingsModal.value = { ...tableSettingsModal.value, open: false };
            return;
          }
          tableSettingsModal.value = {
            open: true,
            originalTableNum: String(state.originalTableNum || state.tableNum || ''),
            tableNum: String(state.tableNum || ''),
            label: state.label || '',
            maxSeats: state.maxSeats || 12,
            minMaxSeats: state.minMaxSeats || 1,
          };
        },
        onGlobalStatsChange(text) {
          globalStatsText.value = text;
        },
        onPrintPreviewChange(state) {
          if (!state?.open) {
            printPreview.value = { ...printPreview.value, open: false, html: '' };
            return;
          }
          printPreview.value = {
            open: true,
            html: state.html || '',
            zoom: state.zoom ?? 1,
            zoomPercent: state.zoomPercent ?? 100,
            orientation: state.orientation || 'portrait',
            pageWidth: state.pageWidth ?? 756,
            pageHeight: state.pageHeight ?? 1085,
          };
        },
      },
    });
  } catch (err) {
    console.error('畫布引擎初始化失敗:', err);
    initError.value = err?.message || '畫布初始化失敗';
  }
}

async function mountEngineWhenReady() {
  if (!tenantId.value) return;
  await nextTick();
  mountEngine();
}

onMounted(() => {
  prefetchAdminRoute();
  document.addEventListener('click', onDocumentClick);
  void mountEngineWhenReady();
});

watch(tenantId, (id) => {
  if (!id) return;
  void mountEngineWhenReady();
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
  destroySeatingEngine();
});
</script>

