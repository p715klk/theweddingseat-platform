import { ref } from 'vue';
import { useTenant } from '@/composables/useTenant';
import { getMaxSeatsForTable, serializeGroupForFirebase } from '@/lib/adminGuestModel';
import {
  setGuestStatusField,
  addWeddingGuestAtTable,
  getTenantTableSettings,
  subscribeTenantData,
} from '@/lib/pb/tenantData';
import { database } from '@/lib/pocketbaseRtdb';
import { onTableSettingsChange } from '@/lib/tableSettingsSync';
import {
  buildCheckInFloorPlan,
  parseArrivedStatus,
  guestStatusKey,
  normalizeTags,
  guestMatchesKeyword,
  FLOOR_CANVAS_SCALE,
  FLOOR_TABLE_PX,
} from '@/lib/guestUtils';

export const TABLE_RING_BASE =
  'floor-table-ring rounded-full border-4 flex items-center justify-center font-semibold';

export function useCheckIn() {
  const { tenantId, tenantDataRecordId } = useTenant();
  const weddingGuests = ref({});
  const guestStatus = ref({});
  const floorLayout = ref({ items: [], bounds: null });
  const selectedTable = ref(null);
  const searchKeyword = ref('');
  const unsubscribers = [];
  let tableSettingsCache = {};
  let lastTableSettingsJson = '';
  let tableSettingsPullTimer = null;

  /** 同 legacy index_script — 只用 table_settings x/y，唔用 floor_layout（避免落後覆蓋） */
  function refreshFloorLayout() {
    floorLayout.value = buildCheckInFloorPlan(weddingGuests.value, tableSettingsCache);
  }

  function applyTableSettings(next) {
    const normalized = next || {};
    const json = JSON.stringify(normalized);
    if (json === lastTableSettingsJson) return;
    lastTableSettingsJson = json;
    tableSettingsCache = normalized;
    refreshFloorLayout();
  }

  function scheduleTableSettingsPull() {
    clearTimeout(tableSettingsPullTimer);
    tableSettingsPullTimer = setTimeout(() => {
      tableSettingsPullTimer = null;
      void pullTableSettings();
    }, 80);
  }

  async function pullTableSettings() {
    const tid = tenantId.value;
    if (!tid) return;
    try {
      const settings = await getTenantTableSettings(tid);
      applyTableSettings(settings);
    } catch (e) {
      console.error('CheckIn 枱位同步失敗:', e);
    }
  }

  function patchGuestStatusField(statusKey, field, value) {
    guestStatus.value = {
      ...guestStatus.value,
      [statusKey]: {
        ...(guestStatus.value[statusKey] || {}),
        [field]: value,
      },
    };
  }

  function patchWeddingGuestAtTable(tableNum, guest) {
    const table = String(tableNum);
    const next = { ...weddingGuests.value };
    next[table] = [...(next[table] || []), guest];
    weddingGuests.value = next;
    refreshFloorLayout();
  }

  function revertWeddingGuestsForTable(tableNum, prevList) {
    const table = String(tableNum);
    const next = { ...weddingGuests.value };
    if (prevList.length) next[table] = prevList;
    else delete next[table];
    weddingGuests.value = next;
    refreshFloorLayout();
  }

  function startSync() {
    stopSync();
    const tid = tenantId.value;
    if (!tid) return;

    const bindPath = (subPath, handler) => {
      const dbRef = database.ref(`tenants/${tid}/${subPath}`);
      dbRef.on('value', handler);
      unsubscribers.push(() => dbRef.off('value', handler));
    };

    bindPath('wedding_guests', (snap) => {
      weddingGuests.value = snap.val() || {};
      refreshFloorLayout();
    });
    bindPath('guest_status', (snap) => {
      guestStatus.value = snap.val() || {};
    });
    bindPath('table_settings', (snap) => {
      applyTableSettings(snap.val());
    });

    const recordId = tenantDataRecordId.value;
    if (recordId) {
      const unsub = subscribeTenantData(recordId, scheduleTableSettingsPull, tid);
      unsubscribers.push(unsub);
    }

    unsubscribers.push(onTableSettingsChange(tid, scheduleTableSettingsPull));
  }

  function stopSync() {
    unsubscribers.forEach((off) => off());
    unsubscribers.length = 0;
    clearTimeout(tableSettingsPullTimer);
    tableSettingsPullTimer = null;
    lastTableSettingsJson = '';
  }

  function tablePercent(tableNum) {
    const guests = weddingGuests.value[tableNum] || [];
    let arrived = 0;
    let active = 0;
    guests.forEach((g) => {
      const st = parseArrivedStatus(guestStatus.value[guestStatusKey(tableNum, g.name)]?.arrived);
      if (st !== '取消') {
        active += 1;
        if (st === '已到') arrived += 1;
      }
    });
    return { percent: active ? Math.round((arrived / active) * 100) : 0, active };
  }

  function circleClass(percent, active) {
    if (percent === 100 && active > 0) {
      return `${TABLE_RING_BASE} border-green-500 bg-green-50 text-green-600`;
    }
    if (percent > 0) {
      return `${TABLE_RING_BASE} border-orange-400 bg-orange-50 text-orange-500`;
    }
    return `${TABLE_RING_BASE} border-gray-300 bg-white text-gray-400`;
  }

  function cardBorderClass(percent, active) {
    if (percent === 100 && active > 0) return 'border-green-500';
    if (percent > 0) return 'border-orange-300';
    return 'border-gray-200';
  }

  async function cycleArrived(table, name, current) {
    const flow = { 未到: '已到', 已到: '取消', 取消: '未到' };
    const next = flow[current] || '未到';
    const tid = tenantId.value;
    if (!tid) return;
    const statusKey = guestStatusKey(table, name);
    const prev = guestStatus.value[statusKey]?.arrived;
    patchGuestStatusField(statusKey, 'arrived', next);
    try {
      await setGuestStatusField(tid, statusKey, 'arrived', next);
    } catch (e) {
      patchGuestStatusField(statusKey, 'arrived', prev);
      console.error('簽到狀態更新失敗:', e);
    }
  }

  async function cycleGift(table, name, current) {
    const stages = ['未交', '人情', '送金器', '電子人情'];
    const next = stages[(stages.indexOf(current) + 1) % stages.length];
    const tid = tenantId.value;
    if (!tid) return;
    const statusKey = guestStatusKey(table, name);
    const prev = guestStatus.value[statusKey]?.gift;
    patchGuestStatusField(statusKey, 'gift', next);
    try {
      await setGuestStatusField(tid, statusKey, 'gift', next);
    } catch (e) {
      patchGuestStatusField(statusKey, 'gift', prev);
      console.error('人情狀態更新失敗:', e);
    }
  }

  function floorStyle(bounds) {
    if (!bounds) return {};
    const scale = FLOOR_CANVAS_SCALE;
    return {
      width: `${Math.ceil(bounds.width * scale)}px`,
      height: `${Math.ceil(bounds.height * scale + FLOOR_TABLE_PX)}px`,
      '--floor-table-px': `${FLOOR_TABLE_PX}px`,
    };
  }

  function tableStyle(item, bounds) {
    if (!bounds) return {};
    const scale = FLOOR_CANVAS_SCALE;
    return {
      left: `${(item.x - bounds.minX) * scale}px`,
      top: `${(item.y - bounds.minY) * scale}px`,
    };
  }

  function getTableMaxSeats(tableNum) {
    return getMaxSeatsForTable(tableNum, tableSettingsCache);
  }

  function getTableOccupancy(tableNum) {
    const guests = weddingGuests.value[tableNum] || [];
    const max = getTableMaxSeats(tableNum);
    let occupied = 0;
    guests.forEach((g) => {
      const st = parseArrivedStatus(guestStatus.value[guestStatusKey(tableNum, g.name)]?.arrived);
      if (st !== '取消') occupied += 1;
    });
    return { occupied, max, remaining: Math.max(0, max - occupied) };
  }

  function getNextSeatForTable(tableNum) {
    const guests = weddingGuests.value[tableNum] || [];
    const max = getTableMaxSeats(tableNum);
    const occupiedActive = new Set();

    guests.forEach((guest) => {
      const key = guestStatusKey(tableNum, guest.name);
      const st = parseArrivedStatus(guestStatus.value[key]?.arrived);
      if (st === '取消') return;
      const sort = parseInt(guest.sort, 10);
      if (!Number.isNaN(sort) && sort >= 1 && sort <= max) {
        occupiedActive.add(sort);
      }
    });

    for (let i = 1; i <= max; i += 1) {
      if (!occupiedActive.has(i)) return i;
    }
    return max;
  }

  async function addWalkInGuest(tableNum, { name, side, group }) {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('請輸入姓名');
    const tid = tenantId.value;
    if (!tid) throw new Error('專案未就緒');
    const table = String(tableNum);
    const nextSeat = getNextSeatForTable(tableNum);
    const guest = {
      name: trimmed,
      side: side === '女方' ? '女方' : '男方',
      group: serializeGroupForFirebase(group || '現場加座'),
      sort: Number(nextSeat),
    };
    const prevList = [...(weddingGuests.value[table] || [])];
    patchWeddingGuestAtTable(tableNum, guest);
    try {
      await addWeddingGuestAtTable(tid, tableNum, guest);
    } catch (e) {
      revertWeddingGuestsForTable(tableNum, prevList);
      throw e;
    }
  }

  function sortedGuests(tableNum) {
    const guests = [...(weddingGuests.value[tableNum] || [])];
    return guests.sort((a, b) => {
      const sa = a.sort !== undefined ? parseInt(a.sort, 10) : 999;
      const sb = b.sort !== undefined ? parseInt(b.sort, 10) : 999;
      return sa - sb;
    });
  }

  function searchResults() {
    const kw = searchKeyword.value.trim();
    if (!kw) return [];
    const results = [];
    Object.keys(weddingGuests.value).forEach((tableNum) => {
      (weddingGuests.value[tableNum] || []).forEach((guest) => {
        if (!guestMatchesKeyword(guest, kw, guestStatus.value)) return;
        const key = guestStatusKey(tableNum, guest.name);
        const st = parseArrivedStatus(guestStatus.value[key]?.arrived);
        results.push({
          tableNum,
          guest,
          arrived: st,
          gift: guestStatus.value[key]?.gift || '未交',
        });
      });
    });
    return results;
  }

  return {
    weddingGuests,
    guestStatus,
    floorLayout,
    selectedTable,
    searchKeyword,
    startSync,
    stopSync,
    tablePercent,
    circleClass,
    cardBorderClass,
    cycleArrived,
    cycleGift,
    floorStyle,
    tableStyle,
    sortedGuests,
    searchResults,
    getTableOccupancy,
    addWalkInGuest,
    guestStatusKey,
    parseArrivedStatus,
    normalizeTags,
    guestMatchesKeyword,
  };
}
