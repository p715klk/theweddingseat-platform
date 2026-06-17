import { ref } from 'vue';
import { get, set, onValue } from '@/rtdb';
import { useTenant } from '@/composables/useTenant';
import { useAuth } from '@/composables/useAuth';
import {
  processFirebaseGuests,
  serializeGuestsForSave,
  syncWeddingGuestsForSave,
  normalizeGuestForList,
  reassignSeatsForTables,
  onGuestTableChange,
  exportGuestsToCSV,
  downloadCsv,
  mergeCategoriesFromGuests,
  findGuestsUsingTag,
} from '@/lib/adminGuestModel';
import {
  parseCSVFileContent,
  buildCSVImportPlan,
  buildCSVImportSuccessMessage,
} from '@/lib/adminCsv';

const DEFAULT_CATEGORIES = ['LK', '家人', '男方親戚', '女方親戚', '中學同學'];

export function useAdminGuests() {
  const { tenantRef, meta } = useTenant();
  const { user } = useAuth();

  const guests = ref([]);
  const categories = ref([...DEFAULT_CATEGORIES]);
  const tableSettings = ref({});
  const dirty = ref(false);
  const loading = ref(false);
  const saving = ref(false);
  const loadError = ref('');
  const toast = ref('');
  let toastTimer = null;
  let unsubscribers = [];
  let syncTimer = null;
  let csvImportInProgress = false;

  function showToast(message, ms = 2000) {
    toast.value = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.value = '';
    }, ms);
  }

  async function ensureOwnerMemberRecord() {
    const uid = user.value?.uid;
    const ownerUid = meta.value?.owner_uid;
    if (!uid || !ownerUid || ownerUid !== uid) return;
    try {
      const snap = await get(tenantRef(`members/${uid}`));
      const role = snap.val();
      if (role === true || role === 'admin') return;
      await set(tenantRef(`members/${uid}`), 'admin');
    } catch (e) {
      console.warn('無法自動補寫 owner members 記錄（不影響賓客儲存）:', e);
    }
  }

  function formatSaveError(e) {
    const code = String(e?.code || '');
    const message = String(e?.message || '');
    if (code === 'PERMISSION_DENIED' || /permission denied/i.test(message)) {
      return '權限不足：請確認你已登入 Owner 或後台管理員帳號，並聯絡平台管理員更新 Firebase 規則。';
    }
    return message || '儲存失敗';
  }

  async function fetchBundle() {
    const [metaSnap, guestsSnap, unassignedSnap, settingsSnap, statusSnap] = await Promise.all([
      get(tenantRef('meta_label_columns')),
      get(tenantRef('wedding_guests')),
      get(tenantRef('unassigned_guests')),
      get(tenantRef('table_settings')),
      get(tenantRef('guest_status')),
    ]);
    return {
      meta: metaSnap.val(),
      weddingGuests: guestsSnap.val() || {},
      unassignedGuests: unassignedSnap.val() || [],
      tableSettings: settingsSnap.val() || {},
      guestStatus: statusSnap.val() || {},
    };
  }

  function applyBundle(bundle) {
    tableSettings.value = bundle.tableSettings || {};
    const meta = bundle.meta;
    if (meta?.categories?.group) {
      categories.value = [...meta.categories.group];
    }
    const list = processFirebaseGuests(
      bundle.weddingGuests,
      bundle.unassignedGuests,
      bundle.guestStatus,
      tableSettings.value,
    );
    categories.value = mergeCategoriesFromGuests(categories.value, list);
    guests.value = list;
    dirty.value = false;
  }

  async function load(force = false) {
    if (dirty.value && !force) return;
    loading.value = true;
    loadError.value = '';
    try {
      await ensureOwnerMemberRecord();
      applyBundle(await fetchBundle());
    } catch (e) {
      loadError.value = e?.message || '載入失敗';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  function scheduleRealtimeRefresh() {
    if (csvImportInProgress || dirty.value) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      load().catch((e) => console.error('Admin 即時同步失敗:', e));
    }, 150);
  }

  function startSync() {
    stopSync();
    ['wedding_guests', 'unassigned_guests', 'guest_status', 'meta_label_columns', 'table_settings'].forEach((path) => {
      const unsub = onValue(tenantRef(path), scheduleRealtimeRefresh);
      unsubscribers.push(unsub);
    });
  }

  function stopSync() {
    unsubscribers.forEach((u) => u());
    unsubscribers = [];
    clearTimeout(syncTimer);
  }

  function markDirty() {
    dirty.value = true;
    stopSync();
  }

  function addGuest() {
    guests.value.push(normalizeGuestForList({
      name: '',
      side: '男方',
      table: '',
      sort: 99,
      group: [],
    }));
    markDirty();
  }

  function removeGuest(index) {
    guests.value.splice(index, 1);
    markDirty();
  }

  function reorderGuests(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const list = [...guests.value];
    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);
    guests.value = list;

    const affected = [];
    if (moved.table !== '' && moved.table != null) affected.push(moved.table);
    reassignSeatsForTables(guests.value, affected, tableSettings.value);
    markDirty();
  }

  function updateGuestTable(guest) {
    onGuestTableChange(guest, guests.value, tableSettings.value);
    markDirty();
  }

  function updateGuestSeat(guest, seat) {
    const n = parseInt(seat, 10);
    if (!Number.isNaN(n) && n >= 1) guest.sort = n;
    markDirty();
  }

  function addCategory(name) {
    const trimmed = name?.trim();
    if (!trimmed || categories.value.includes(trimmed)) return false;
    categories.value.push(trimmed);
    markDirty();
    return true;
  }

  function removeCategory(tag) {
    if (findGuestsUsingTag(guests.value, tag).length > 0) return false;
    categories.value = categories.value.filter((c) => c !== tag);
    markDirty();
    return true;
  }

  function emptyAllGuests() {
    guests.value = [];
    markDirty();
  }

  function exportCSV() {
    if (!guests.value.length) return;
    downloadCsv(exportGuestsToCSV(guests.value));
  }

  async function parseCSVFile(file) {
    const text = await file.text();
    return parseCSVFileContent(text);
  }

  function previewCSVImport(importedGuests, mode) {
    return buildCSVImportPlan(importedGuests, guests.value, mode);
  }

  async function applyCSVImport(plan) {
    csvImportInProgress = true;
    try {
      guests.value = plan.resultGuests.map((g) => normalizeGuestForList(g));
      categories.value = mergeCategoriesFromGuests(categories.value, guests.value);
      markDirty();
      await save({ toastMessage: buildCSVImportSuccessMessage(plan) });
    } finally {
      csvImportInProgress = false;
    }
  }

  async function save(options = {}) {
    if (!dirty.value) return;
    const { toastMessage = '✨ 【後台數據同步成功】！已完美推送至畫布。' } = options;
    saving.value = true;
    try {
      await ensureOwnerMemberRecord();
      const { wedding, unassigned } = serializeGuestsForSave(guests.value);
      const results = await Promise.allSettled([
        syncWeddingGuestsForSave(tenantRef, wedding),
        set(tenantRef('unassigned_guests'), unassigned),
        set(tenantRef('meta_label_columns'), {
          keys: ['group'],
          names: ['標籤 (可多選)'],
          categories: { group: categories.value },
        }),
      ]);
      const labels = ['wedding_guests', 'unassigned_guests', 'meta_label_columns'];
      const failedIdx = results.findIndex((r) => r.status === 'rejected');
      if (failedIdx !== -1) {
        const reason = results[failedIdx].reason;
        const path = labels[failedIdx];
        const err = reason instanceof Error ? reason : new Error(String(reason));
        err.message = `${path}: ${err.message || '寫入失敗'}`;
        throw err;
      }

      dirty.value = false;
      showToast(toastMessage, 2500);
      startSync();
      try {
        await load(true);
      } catch (reloadErr) {
        console.warn('儲存成功但重新載入失敗（Firebase 資料已寫入）:', reloadErr);
      }
    } catch (e) {
      throw new Error(formatSaveError(e));
    } finally {
      saving.value = false;
    }
  }

  function getMaxSeats(tableNum) {
    const settings = tableSettings.value;
    const n = parseInt(tableNum, 10);
    if (Number.isNaN(n)) return 12;
    const s = settings[n] || settings[String(n)];
    const configured = parseInt(s?.max_seats, 10);
    return !Number.isNaN(configured) && configured >= 1 ? Math.min(configured, 99) : 12;
  }

  return {
    guests,
    categories,
    tableSettings,
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
  };
}
