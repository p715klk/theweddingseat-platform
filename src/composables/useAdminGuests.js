import { ref } from 'vue';
import { useTenant } from '@/composables/useTenant';
import { useAuth } from '@/composables/useAuth';
import { ensureOwnerMemberRecord } from '@/lib/pb/members';
import {
  getTenantDataBundle,
  saveAdminGuestBundle,
  subscribeTenantData,
  subscribeTenantDataByTenantId,
} from '@/lib/pb/tenantData';
import {
  processFirebaseGuests,
  serializeGuestsForSave,
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
  const { tenantId, tenantDataRecordId, meta } = useTenant();
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
  let localDataRecordId = '';

  function showToast(message, ms = 2000) {
    toast.value = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.value = '';
    }, ms);
  }

  async function ensureOwnerRecord() {
    const uid = user.value?.uid;
    const ownerUid = meta.value?.owner_uid;
    const tid = tenantId.value;
    if (!uid || !ownerUid || ownerUid !== uid || !tid) return;
    try {
      await ensureOwnerMemberRecord(tid, uid);
    } catch (e) {
      console.warn('無法自動補寫 owner members 記錄（不影響賓客儲存）:', e);
    }
  }

  function formatSaveError(e) {
    const status = e?.status ?? e?.response?.status;
    const message = String(e?.message || '');
    if (status === 403 || /permission|forbidden/i.test(message)) {
      return '權限不足：請確認你已登入 Owner 或後台管理員帳號。';
    }
    return message || '儲存失敗';
  }

  async function fetchBundle() {
    const tid = tenantId.value;
    if (!tid) throw new Error('專案未就緒');
    const bundle = await getTenantDataBundle(tid);
    if (bundle.recordId) {
      localDataRecordId = bundle.recordId;
      tenantDataRecordId.value = bundle.recordId;
    }
    return {
      meta: bundle.meta_label_columns,
      weddingGuests: bundle.wedding_guests || {},
      unassignedGuests: bundle.unassigned_guests || [],
      tableSettings: bundle.table_settings || {},
      guestStatus: bundle.guest_status || {},
    };
  }

  function applyBundle(bundle) {
    tableSettings.value = bundle.tableSettings || {};
    const labelMeta = bundle.meta;
    if (labelMeta?.categories?.group) {
      categories.value = [...labelMeta.categories.group];
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
      await ensureOwnerRecord();
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
    const tid = tenantId.value;
    if (!tid) return;

    const recordId = localDataRecordId || tenantDataRecordId.value;
    if (recordId) {
      unsubscribers.push(
        subscribeTenantData(recordId, scheduleRealtimeRefresh),
      );
      return;
    }

    subscribeTenantDataByTenantId(tid, (bundle) => {
      if (bundle.recordId) {
        localDataRecordId = bundle.recordId;
        tenantDataRecordId.value = bundle.recordId;
      }
      scheduleRealtimeRefresh();
    }).then((unsub) => unsubscribers.push(unsub));
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
    const tid = tenantId.value;
    if (!tid) throw new Error('專案未就緒');

    const unnamed = guests.value.filter((g) => !g.name?.trim()).length;
    if (unnamed > 0) {
      throw new Error(`有 ${unnamed} 位賓客尚未填寫姓名，儲存時會被略過；請先補上姓名。`);
    }

    saving.value = true;
    try {
      await ensureOwnerRecord();
      const { wedding, unassigned } = serializeGuestsForSave(guests.value);
      const labelColumns = {
        keys: ['group'],
        names: ['標籤 (可多選)'],
        categories: { group: categories.value },
      };
      await saveAdminGuestBundle(tid, {
        wedding,
        unassigned,
        meta_label_columns: labelColumns,
      });

      dirty.value = false;
      showToast(toastMessage, 2500);
      startSync();
      try {
        await load(true);
      } catch (reloadErr) {
        console.warn('儲存成功但重新載入失敗（伺服器資料已寫入）:', reloadErr);
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
