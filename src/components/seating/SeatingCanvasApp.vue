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
        <div class="text-[11px] bg-slate-100 px-2.5 py-1 rounded-full text-slate-600 font-bold" id="global-stats">載入中...</div>
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
              <div id="find-table-list" class="no-scrollbar" />
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
            title="鎖定枱位（防止拖動）"
            @click="toggleTablePositionLock()"
          >
            🔓<span class="hide-mobile"> 鎖枱</span>
          </button>
        </div>
        <div class="header-action-group">
          <div class="relative" id="print-menu-wrap">
            <button
              type="button"
              id="btn-print-menu"
              class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 transition"
              @click="togglePrintMenu($event)"
            >
              🖨️<span class="hide-mobile"> 打印</span>
            </button>
            <div id="print-menu" class="hidden absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-xs font-bold overflow-hidden">
              <button type="button" class="w-full text-left px-3 py-2 hover:bg-slate-50 active:bg-slate-100 text-slate-700" @click="handlePrintMenuAction('canvas', $event)">🖼️ 打印畫面（全部枱位）</button>
              <button type="button" class="w-full text-left px-3 py-2 hover:bg-slate-50 active:bg-slate-100 text-slate-700 border-t border-slate-100" @click="handlePrintMenuAction('guest-list', $event)">📋 打印圓枱名單（文字版）</button>
            </div>
          </div>
          <a
            id="link-back-admin"
            :href="adminHref"
            class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 transition"
          >
            📋<span class="hide-mobile"> 返回</span>
          </a>
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

    <div id="guest-detail-modal" class="fixed inset-0 bg-slate-950/40 z-50 hidden items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 border border-slate-100">
        <div class="flex justify-between items-start mb-3">
          <h3 class="modal-heading text-base font-black text-slate-900">✏️ 編輯賓客資料</h3>
          <button type="button" class="text-slate-400 hover:text-slate-600 text-xl font-bold" @click="closeGuestModal()">&times;</button>
        </div>
        <div class="modal-form-text space-y-3 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100">
          <div>
            <label class="modal-form-label block text-xs font-bold text-slate-400 mb-1">姓名：</label>
            <input type="text" id="edit-guest-name" class="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
          </div>
          <div>
            <label class="modal-form-label block text-xs font-bold text-slate-400 mb-1">標籤（可多選）：</label>
            <div id="edit-guest-tags" class="row-multi-tags flex flex-wrap items-center gap-1 min-h-[36px] bg-white border border-slate-200 rounded-lg p-2" data-column-key="group" />
          </div>
          <div>
            <label class="modal-form-label block text-xs font-bold text-slate-400 mb-1">來源：</label>
            <select id="edit-guest-side" class="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" @change="refreshModalTagColors()">
              <option value="男方">男方</option>
              <option value="女方">女方</option>
            </select>
          </div>
          <div class="flex justify-between items-center pt-1">
            <span class="text-slate-400 font-bold">目前席位：</span>
            <span id="md-guest-seat" class="font-mono bg-amber-100 px-2 py-0.5 rounded text-amber-800 font-bold" />
          </div>
        </div>
        <div class="space-y-2 mt-4">
          <button type="button" class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-sm transition" @click="saveGuestChangesAction()">
            💾 儲存並更新資料
          </button>
          <button id="btn-remove-from-seat" type="button" class="w-full py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-sm font-bold transition" @click="removeGuestFromSeatAction()">
            ↩️ 移出席位 (退回未安排)
          </button>
        </div>
      </div>
    </div>

    <div id="custom-dialog-overlay" class="fixed inset-0 bg-black/50 z-[60] hidden items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 border border-gray-100">
        <h3 class="text-base font-bold text-gray-900 mb-2">➕ 新增自訂選項</h3>
        <p class="text-xs text-gray-500 mb-4">請輸入你想加入標籤清單的新選項名稱：</p>
        <input type="text" id="custom-category-input" class="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-4">
        <div class="flex justify-end gap-2">
          <button type="button" class="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold" @click="closeCustomCategoryDialog(false)">取消</button>
          <button type="button" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow" @click="closeCustomCategoryDialog(true)">確認新增</button>
        </div>
      </div>
    </div>

    <div id="delete-tag-dialog-overlay" class="fixed inset-0 bg-black/50 z-[60] hidden items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 border border-gray-100">
        <h3 class="text-base font-bold text-gray-900 mb-2">🗑️ 刪除標籤</h3>
        <p class="text-xs text-gray-500 mb-3">從標籤清單移除；若有賓客仍使用該標籤，將無法刪除。</p>
        <label class="block text-xs font-bold text-gray-500 mb-1">選擇要刪除的標籤：</label>
        <select id="delete-tag-select" class="w-full border border-gray-300 rounded-lg p-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-red-500" @change="updateDeleteTagUsageHint()" />
        <p id="delete-tag-usage-hint" class="text-xs mb-4 text-gray-600" />
        <div class="flex justify-end gap-2">
          <button type="button" class="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold" @click="closeDeleteTagDialog(false)">取消</button>
          <button id="btn-confirm-delete-tag" type="button" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow disabled:opacity-40 disabled:cursor-not-allowed" disabled @click="closeDeleteTagDialog(true)">確認刪除</button>
        </div>
      </div>
    </div>

    <div id="table-settings-modal" class="fixed inset-0 bg-slate-950/40 z-50 hidden items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 border border-slate-100">
        <h3 class="text-sm font-black text-slate-900 mb-3" id="modal-table-title">⚙️ 圓枱設定</h3>
        <div class="space-y-3">
          <div>
            <label class="block text-[11px] font-bold text-slate-500 mb-1">枱號 (可跳過 4、14 等)：</label>
            <input type="number" id="modal-table-num" min="1" max="99" autocomplete="off" class="w-full border border-slate-200 rounded-lg p-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500">
          </div>
          <div>
            <label class="block text-[11px] font-bold text-slate-500 mb-1">枱標籤（顯示於枱中央）：</label>
            <input type="text" id="modal-table-label" placeholder="例如：主家席、父親朋友、母親朋友" autocomplete="off" class="w-full border border-slate-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          </div>
          <div>
            <label class="block text-[11px] font-bold text-slate-500 mb-1">此桌座位數量 (人數上限)：</label>
            <input type="number" id="modal-max-seats" min="1" max="99" class="w-full border border-slate-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          </div>
        </div>
        <div class="flex justify-between items-center mt-5 pt-3 border-t border-slate-100">
          <button type="button" class="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-md text-xs font-bold transition" @click="deleteTableAction()">🗑️ 刪除此桌</button>
          <div class="flex gap-2">
            <button type="button" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-bold" @click="closeSettingsModal()">取消</button>
            <button type="button" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-bold" @click="saveTableSettingsAction()">儲存</button>
          </div>
        </div>
      </div>
    </div>

    <div id="print-preview-overlay" class="hidden">
      <div class="print-preview-toolbar min-h-14 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 px-4 py-2 shrink-0">
        <button type="button" class="text-sm font-bold text-slate-600 hover:text-slate-900 shrink-0" @click="closePrintPreview()">← 返回畫布</button>
        <div class="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          <span class="text-sm font-black text-slate-800">列印預覽</span>
          <div class="flex items-center bg-slate-100 rounded-lg border border-slate-200 text-xs font-bold">
            <button type="button" class="px-2.5 py-1.5 hover:bg-slate-200 text-slate-500" @click="stepPrintPreviewZoom(-0.2)">－</button>
            <span id="print-zoom-percent" class="px-2 font-mono text-slate-700 min-w-[42px] text-center">100%</span>
            <button type="button" class="px-2.5 py-1.5 hover:bg-slate-200 text-slate-500" @click="stepPrintPreviewZoom(0.2)">＋</button>
            <button type="button" class="px-2 py-1.5 hover:bg-slate-200 text-slate-500 border-l border-slate-200" title="縮細預覽以睇晒成張 A4" @click="fitPrintPreviewZoom()">⊡</button>
          </div>
          <div class="flex items-center bg-slate-100 rounded-lg border border-slate-200 text-xs font-bold overflow-hidden">
            <button type="button" id="btn-print-portrait" class="print-orient-btn px-2.5 py-1.5 hover:bg-slate-200 text-slate-600" @click="setPrintOrientation('portrait')">直向</button>
            <button type="button" id="btn-print-landscape" class="print-orient-btn px-2.5 py-1.5 hover:bg-slate-200 text-slate-600 border-l border-slate-200" @click="setPrintOrientation('landscape')">橫向</button>
          </div>
        </div>
        <button type="button" class="bg-amber-800 hover:bg-amber-900 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm shrink-0" @click="executePrintPreview()">列印</button>
      </div>
      <div id="print-preview-scroll" class="flex-1 overflow-auto p-6 flex justify-center items-start min-h-0">
        <div id="print-preview-viewport">
          <div id="print-preview-sheet" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useTenant } from '@/composables/useTenant';
import { appPath } from '@/lib/appBase';
import {
  initSeatingEngine,
  destroySeatingEngine,
  zoomCanvas,
  centerViewOnTables,
  toggleFindTableMenu,
  createNewTableAction,
  toggleTablePositionLock,
  togglePrintMenu,
  handlePrintMenuAction,
  toggleSidebar,
  closeGuestModal,
  saveGuestChangesAction,
  removeGuestFromSeatAction,
  closeCustomCategoryDialog,
  closeDeleteTagDialog,
  closeSettingsModal,
  saveTableSettingsAction,
  deleteTableAction,
  closePrintPreview,
  stepPrintPreviewZoom,
  fitPrintPreviewZoom,
  setPrintOrientation,
  executePrintPreview,
  allowDrop,
  handleDropTrash,
  refreshModalTagColors,
  updateDeleteTagUsageHint,
} from '@/seating/seatingEngine';
import '@/assets/seating-canvas.css';

const props = defineProps({
  slug: { type: String, required: true },
});

const emit = defineEmits(['logout']);

const { tenantRef, tenantId } = useTenant();
const initError = ref('');

const adminHref = computed(() => appPath(`p/${props.slug}/admin`));

function mountEngine() {
  if (!tenantId.value) return;
  initError.value = '';
  try {
    initSeatingEngine({
      tenantRef,
      slug: props.slug,
      onLogout: () => emit('logout'),
      adminHref: adminHref.value,
    });
  } catch (err) {
    console.error('畫布引擎初始化失敗:', err);
    initError.value = err?.message || '畫布初始化失敗';
  }
}

onMounted(() => {
  if (tenantId.value) mountEngine();
});

watch(tenantId, (id) => {
  if (!id) return;
  requestAnimationFrame(() => mountEngine());
});

onUnmounted(() => {
  destroySeatingEngine();
});
</script>

