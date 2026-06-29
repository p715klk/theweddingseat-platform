<template>
  <div class="admin-page bg-gray-100 text-gray-800 font-sans h-screen flex flex-col p-4 overflow-hidden">
    <div class="w-full max-w-[98%] mx-auto flex flex-col h-full space-y-3">
      <header class="flex flex-col lg:flex-row justify-between items-start lg:items-center border-b border-gray-300 pb-3 flex-shrink-0 gap-3">
        <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0 flex-1 lg:flex-initial">
          <h1 class="text-xl font-bold text-red-700 shrink-0">📋 賓客名單管理後台</h1>
          <span v-if="coupleNames" class="text-sm font-bold text-gray-600 shrink-0">{{ coupleNames }}</span>
          <span class="header-hint text-[11.3px] text-gray-700 font-normal leading-snug">
            表單「🔒拖動」欄可切換鎖定；標籤欄支援多選(用＋加入標籤)；表頭欄位分界線可拖拉調整欄寬。修改後需儲存變更。
            <span v-if="dirty" class="text-amber-600 font-bold">（有未儲存改動）</span>
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <button
            type="button"
            class="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow transition"
            @click="handleAddGuest"
          >
            ➕ 新增賓客
          </button>
          <button
            type="button"
            class="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow transition disabled:opacity-60"
            :class="dirty && !saving ? 'ring-2 ring-yellow-400 ring-offset-1' : ''"
            :disabled="saving"
            :title="dirty ? '有未儲存的改動，請按此儲存' : ''"
            @click="handleSave"
          >
            {{ saving ? '儲存中…' : '💾 儲存變更' }}
          </button>

          <div class="relative" id="settings-dropdown">
            <input ref="csvInputRef" id="csv-file-input" type="file" accept=".csv" class="hidden" @change="onCsvSelected" />
            <button
              type="button"
              id="btn-settings"
              class="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow transition"
              @click="settingsDialogOpen = true"
            >
              ⚙ 設定
            </button>
          </div>

          <button
            type="button"
            class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow transition text-center disabled:opacity-70"
            :disabled="!!navigatingTo"
            @mouseenter="prefetchSeatingRoute"
            @focus="prefetchSeatingRoute"
            @click="requestLeave(seatingRoute)"
          >
            {{ navigatingTo === seatingRoute ? '載入畫布…' : '🦢 前往畫布排位' }}
          </button>
          <button
            type="button"
            class="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow transition text-center disabled:opacity-70"
            :disabled="!!navigatingTo"
            @click="requestLeave(checkInRoute)"
          >
            {{ navigatingTo === checkInRoute ? '載入中…' : '🏠 前往點名首頁' }}
          </button>
          <button
            type="button"
            class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-300 transition"
            @click="emit('logout')"
          >
            登出
          </button>
        </div>
      </header>

      <div class="bg-white rounded-xl shadow border border-gray-200 flex-1 min-h-0 flex flex-col overflow-hidden">
        <AdminGuestTable
          ref="guestTableRef"
          :guests="guests"
          :categories="categories"
          :loading="loading"
          :load-error="loadError"
          :drag-locked="dragSortLocked"
          :get-max-seats="getMaxSeats"
          @dirty="markDirty()"
          @reorder="(from, to) => reorderGuests(from, to)"
          @toggle-drag-lock="toggleDragSortLock"
          @table-change="(g) => updateGuestTable(g)"
          @seat-change="(g, seat) => updateGuestSeat(g, seat)"
          @remove="(i) => removeGuest(i)"
          @add-category="(name) => addCategory(name)"
          @request-delete-category="deleteTagOpen = true"
          @retry="load(true)"
        />
      </div>

      <div class="text-right text-[10px] text-gray-400 font-mono flex-shrink-0 px-1">
        Wedding Manager Panel v5.0 (多選標籤)
      </div>
    </div>

    <div
      id="admin-toast"
      class="admin-toast"
      :class="{ 'is-visible': !!toast, hidden: !toast }"
      role="status"
      aria-live="polite"
    >
      {{ toast }}
    </div>

    <div
      v-if="leaveDialog"
      class="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
    >
      <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 border border-gray-100">
        <h3 class="text-base font-bold text-gray-900 mb-2">⚠️ 有未儲存的改動</h3>
        <p class="text-xs text-gray-500 mb-4 leading-relaxed">你尚未按「儲存變更」。若現在離開，修改將不會同步到畫布同點名頁。</p>
        <div class="flex flex-col gap-2">
          <button type="button" class="w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow" @click="leaveSaveAndGo">💾 儲存並離開</button>
          <button type="button" class="w-full px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold" @click="leaveDiscard">不儲存，離開</button>
          <button type="button" class="w-full px-3 py-2 bg-white hover:bg-gray-50 text-gray-500 rounded-lg text-xs font-bold border border-gray-200" @click="leaveDialog = false">留在此頁</button>
        </div>
      </div>
    </div>

    <div
      v-if="dragUnlockDialogOpen"
      class="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
      @click.self="dragUnlockDialogOpen = false"
    >
      <div class="bg-white rounded-xl shadow-xl max-w-md w-full p-5 border border-gray-100">
        <h3 class="text-base font-bold text-gray-900 mb-2">解鎖拖動排序？</h3>
        <p class="text-xs text-gray-500 mb-3 leading-relaxed">按住 ☰ 可調整賓客順序。</p>
        <p class="text-base font-bold text-red-600 leading-relaxed mb-3">
          注意：若該桌未滿座，拖動時空位會造成向前移動。
        </p>
        <p class="text-xs text-gray-500 mb-4 leading-relaxed">儲存或離開頁面時會自動鎖定。</p>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold"
            @click="dragUnlockDialogOpen = false"
          >
            取消
          </button>
          <button
            type="button"
            class="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow"
            @click="confirmDragUnlock"
          >
            解鎖拖動
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="deleteTagOpen"
      class="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
      @click.self="deleteTagOpen = false"
    >
      <div class="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 border border-gray-100">
        <h3 class="text-base font-bold text-gray-900 mb-2">🗑️ 刪除標籤</h3>
        <p class="text-xs text-gray-500 mb-3">從標籤清單移除；若有賓客仍使用該標籤，將無法刪除。</p>
        <select v-model="deleteTagSelected" class="w-full border border-gray-300 rounded-lg p-2 text-sm mb-3">
          <option value="">— 選擇 —</option>
          <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
        </select>
        <p v-if="deleteTagSelected" class="text-xs mb-4 text-gray-600">{{ deleteTagHint }}</p>
        <div class="flex justify-end gap-2">
          <button type="button" class="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold" @click="deleteTagOpen = false">取消</button>
          <button
            type="button"
            class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow disabled:opacity-40"
            :disabled="!canDeleteTag"
            @click="confirmDeleteTag"
          >
            確認刪除
          </button>
        </div>
      </div>
    </div>

    <AdminSettingsDialog
      :open="settingsDialogOpen"
      @close="settingsDialogOpen = false"
      @import-csv="openCsvPicker"
      @export-csv="onExportCsv"
      @empty-guests="confirmEmpty"
    />

    <AdminCsvImportDialog
      :open="csvDialogOpen"
      :file-name="csvFileName"
      :imported-guests="csvImportedGuests"
      :preview-fn="previewCSVImport"
      :applying="saving"
      @cancel="csvDialogOpen = false"
      @confirm="onCsvConfirm"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { useAdminGuests } from '@/composables/useAdminGuests';
import { findGuestsUsingTag } from '@/lib/adminGuestModel';
import { isChunkLoadError, reloadForStaleChunk } from '@/lib/chunkReload';
import AdminGuestTable from '@/components/admin/AdminGuestTable.vue';
import AdminCsvImportDialog from '@/components/admin/AdminCsvImportDialog.vue';
import AdminSettingsDialog from '@/components/admin/AdminSettingsDialog.vue';

const props = defineProps({
  slug: { type: String, required: true },
  coupleNames: { type: String, default: '' },
});

const emit = defineEmits(['logout']);

const router = useRouter();
const {
  guests,
  categories,
  dirty,
  loading,
  saving,
  loadError,
  toast,
  load,
  save,
  addGuest,
  removeGuest,
  reorderGuests,
  updateGuestTable,
  updateGuestSeat,
  addCategory,
  removeCategory,
  emptyAllGuests,
  exportCSV,
  parseCSVFile,
  previewCSVImport,
  applyCSVImport,
  markDirty,
  startSync,
  stopSync,
  getMaxSeats,
  showToast,
} = useAdminGuests();

const settingsDialogOpen = ref(false);
const csvInputRef = ref(null);
const guestTableRef = ref(null);
const csvDialogOpen = ref(false);
const csvFileName = ref('');
const csvImportedGuests = ref([]);
const leaveDialog = ref(false);
const pendingLeave = ref(null);
const navigatingTo = ref('');
const deleteTagOpen = ref(false);
const deleteTagSelected = ref('');
const dragSortLocked = ref(true);
const dragUnlockDialogOpen = ref(false);

const checkInRoute = computed(() => `/p/${props.slug}`);
const seatingRoute = computed(() => `/p/${props.slug}/seating`);

const deleteTagHint = computed(() => {
  if (!deleteTagSelected.value) return '';
  const used = findGuestsUsingTag(guests.value, deleteTagSelected.value);
  if (used.length) return `⚠️ 有 ${used.length} 位賓客使用此標籤，無法刪除。`;
  return '可以刪除此標籤。';
});

const canDeleteTag = computed(() =>
  deleteTagSelected.value && findGuestsUsingTag(guests.value, deleteTagSelected.value).length === 0,
);

function lockDragSort() {
  dragSortLocked.value = true;
}

function toggleDragSortLock() {
  if (!dragSortLocked.value) {
    lockDragSort();
    return;
  }
  dragUnlockDialogOpen.value = true;
}

function confirmDragUnlock() {
  dragUnlockDialogOpen.value = false;
  dragSortLocked.value = false;
  unlockDragDialog.value = false;
}

function openCsvPicker() {
  settingsDialogOpen.value = false;
  if (csvInputRef.value) {
    csvInputRef.value.value = '';
    csvInputRef.value.click();
  }
}

function onExportCsv() {
  settingsDialogOpen.value = false;
  exportCSV();
}

function prefetchSeatingRoute() {
  void import('@/views/SeatingView.vue');
  void import('@/components/seating/SeatingCanvasApp.vue');
}

async function navigateTo(path) {
  if (!path || navigatingTo.value) return;
  navigatingTo.value = path;
  try {
    if (path === seatingRoute.value) prefetchSeatingRoute();
    await router.push(path);
  } catch (e) {
    if (isChunkLoadError(e) && reloadForStaleChunk()) return;
    console.error('導航失敗:', e);
    window.alert('頁面載入失敗，請重試或重新整理');
  } finally {
    navigatingTo.value = '';
  }
}

onMounted(async () => {
  prefetchSeatingRoute();
  startSync();
  try {
    await load(true);
  } catch {
    /* loadError shown in table */
  }
});

onUnmounted(() => {
  lockDragSort();
  stopSync();
});

async function handleSave() {
  try {
    await save();
    lockDragSort();
  } catch (e) {
    window.alert(`❌ 儲存失敗: ${e.message}`);
  }
}

function handleAddGuest() {
  addGuest();
  nextTick(() => {
    guestTableRef.value?.setupSortable({ scrollToBottom: true });
  });
}

function confirmEmpty() {
  settingsDialogOpen.value = false;
  if (!guests.value.length) {
    showToast('目前沒有賓客可清空');
    return;
  }
  const ok = window.confirm(`確定要清空所有賓客嗎？\n\n將移除 ${guests.value.length} 位賓客，需按「儲存變更」才會同步到伺服器。`);
  if (ok) emptyAllGuests();
}

async function onCsvSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const parsed = await parseCSVFile(file);
    if (parsed.error) {
      window.alert(parsed.error);
      return;
    }
    csvFileName.value = file.name;
    csvImportedGuests.value = parsed.importedGuests;
    csvDialogOpen.value = true;
  } catch {
    window.alert('❌ 讀取 CSV 檔案失敗，請重試。');
  }
}

async function onCsvConfirm(plan) {
  try {
    await applyCSVImport(plan);
    csvDialogOpen.value = false;
    lockDragSort();
  } catch (e) {
    window.alert(`❌ 匯入失敗: ${e.message}`);
  }
}

function confirmDeleteTag() {
  if (!canDeleteTag.value) return;
  removeCategory(deleteTagSelected.value);
  deleteTagOpen.value = false;
  deleteTagSelected.value = '';
}

function requestLeave(path) {
  if (navigatingTo.value) return;
  lockDragSort();
  if (!dirty.value) {
    void navigateTo(path);
    return;
  }
  pendingLeave.value = path;
  leaveDialog.value = true;
}

async function leaveSaveAndGo() {
  try {
    await save();
    lockDragSort();
    leaveDialog.value = false;
    if (pendingLeave.value) await navigateTo(pendingLeave.value);
  } catch (e) {
    window.alert(`❌ 儲存失敗: ${e.message}`);
  }
}

function leaveDiscard() {
  dirty.value = false;
  lockDragSort();
  leaveDialog.value = false;
  if (pendingLeave.value) void navigateTo(pendingLeave.value);
}

onBeforeRouteLeave((to) => {
  lockDragSort();
  if (!dirty.value) return true;
  pendingLeave.value = to.fullPath;
  leaveDialog.value = true;
  return false;
});
</script>
