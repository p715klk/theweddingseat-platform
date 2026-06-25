import { syncWeddingGuestsForSave as pbSyncWeddingGuests } from '@/lib/pb/tenantData';
import {
  normalizeTags,
  PRIMARY_TAG_KEY,
  DEFAULT_MAX_SEATS,
  ABSOLUTE_MAX_SEATS,
} from '@/lib/guestUtils';

export { PRIMARY_TAG_KEY };

export function getMaxSeatsForTable(tableNum, tableSettings = {}) {
  const n = parseInt(tableNum, 10);
  if (Number.isNaN(n)) return DEFAULT_MAX_SEATS;
  const settings = tableSettings[n] || tableSettings[String(n)];
  const configured = parseInt(settings?.max_seats, 10);
  if (!Number.isNaN(configured) && configured >= 1) {
    return Math.min(configured, ABSOLUTE_MAX_SEATS);
  }
  return DEFAULT_MAX_SEATS;
}

export function guestIdentityKey(guest) {
  const name = String(guest?.name || '').trim();
  const side = guest?.side === '女方' ? '女方' : '男方';
  const tags = normalizeTags(guest?.group).slice().sort().join(';');
  return `${name}\x1f${side}\x1f${tags}`;
}

export function normalizeGuestForList(guest) {
  const tableRaw = guest?.table;
  const tableNum = parseInt(tableRaw, 10);
  const hasTable = tableRaw !== '' && tableRaw != null && !Number.isNaN(tableNum) && tableNum >= 1;
  const sortNum = parseInt(guest?.sort, 10);
  return {
    id: String(guest?.id || '').trim() || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`),
    _key: guest._key || guest.id || `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name: String(guest?.name || '').trim(),
    side: guest?.side === '女方' ? '女方' : '男方',
    table: hasTable ? tableNum : '',
    sort: hasTable ? ((!Number.isNaN(sortNum) && sortNum >= 1) ? sortNum : 1) : 99,
    group: normalizeTags(guest?.group),
    isCanceled: !!guest?.isCanceled,
    preservedSort: guest?.preservedSort ?? null,
  };
}

export function sortGuestsListByTableAndSeat(list) {
  list.sort((a, b) => {
    const tableA = a.table === '' || a.table == null || Number.isNaN(a.table) ? 9999 : parseInt(a.table, 10);
    const tableB = b.table === '' || b.table == null || Number.isNaN(b.table) ? 9999 : parseInt(b.table, 10);
    if (tableA !== tableB) return tableA - tableB;
    const seatA = parseInt(a.sort, 10);
    const seatB = parseInt(b.sort, 10);
    return (Number.isNaN(seatA) ? 99 : seatA) - (Number.isNaN(seatB) ? 99 : seatB);
  });
  return list;
}

function isGuestCanceled(tableNum, guestName, guestStatus) {
  const key = `${tableNum}_${guestName}`;
  return guestStatus?.[key]?.arrived === '取消';
}

export function resolveGuestSeatNumber(tableNum, guest, tableGuests, guestStatus, tableSettings) {
  const existingSort = parseInt(guest.sort, 10);
  if (!Number.isNaN(existingSort) && existingSort >= 1) return existingSort;

  const occupiedActive = new Set();
  tableGuests.forEach((g) => {
    if (g === guest || !g?.name) return;
    const key = `${tableNum}_${g.name}`;
    if (guestStatus?.[key]?.arrived === '取消') return;
    const sort = parseInt(g.sort, 10);
    if (!Number.isNaN(sort) && sort >= 1) occupiedActive.add(sort);
  });

  const maxSeats = getMaxSeatsForTable(tableNum, tableSettings);
  for (let i = 1; i <= maxSeats; i += 1) {
    if (!occupiedActive.has(i)) return i;
  }
  return 1;
}

export function processFirebaseGuests(weddingGuests, unassignedGuests, guestStatus, tableSettings) {
  const list = [];

  Object.keys(weddingGuests || {})
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .forEach((tableNum) => {
      const tableList = weddingGuests[tableNum];
      if (!Array.isArray(tableList)) return;
      const tableGuests = tableList.filter((g) => g?.name);
      const tableNumInt = parseInt(tableNum, 10);

      tableGuests.forEach((guest) => {
        const rawSort = parseInt(guest.sort, 10);
        const canceled = isGuestCanceled(tableNumInt, guest.name, guestStatus);
        const preservedSort = !Number.isNaN(rawSort) && rawSort >= 1 ? rawSort : null;
        list.push(normalizeGuestForList({
          id: guest.id,
          name: guest.name,
          side: guest.side || '男方',
          table: tableNumInt,
          sort: preservedSort ?? resolveGuestSeatNumber(
            tableNumInt,
            guest,
            tableGuests,
            guestStatus,
            tableSettings,
          ),
          isCanceled: canceled,
          preservedSort,
          group: normalizeTags(guest.group ?? guest[PRIMARY_TAG_KEY]),
        }));
      });
    });

  (unassignedGuests || []).forEach((guest) => {
    if (!guest?.name) return;
    list.push(normalizeGuestForList({
      name: guest.name,
      id: guest.id,
      side: guest.side || '男方',
      table: '',
      sort: 99,
      group: normalizeTags(guest.group ?? guest[PRIMARY_TAG_KEY]),
    }));
  });

  return sortGuestsListByTableAndSeat(list);
}

export function getReservedSeatsForTable(guests, tableNum) {
  const reserved = new Set();
  guests.forEach((g) => {
    if (!g.isCanceled || g.table !== tableNum) return;
    const preserved = parseInt(g.preservedSort, 10);
    if (!Number.isNaN(preserved) && preserved >= 1) reserved.add(preserved);
  });
  return reserved;
}

export function getAssignableSeatsForTable(tableNum, reservedSeats, tableSettings) {
  const maxSeats = getMaxSeatsForTable(tableNum, tableSettings);
  const limit = Math.min(maxSeats, ABSOLUTE_MAX_SEATS);
  const seats = [];
  for (let i = 1; i <= limit; i += 1) {
    if (!reservedSeats.has(i)) seats.push(i);
  }
  return seats;
}

export function reassignSeatsForTable(guests, tableNum, tableSettings) {
  const reserved = getReservedSeatsForTable(guests, tableNum);
  const assignable = getAssignableSeatsForTable(tableNum, reserved, tableSettings);
  let seatIdx = 0;
  guests.forEach((g) => {
    if (g.table !== tableNum || g.isCanceled) return;
    g.sort = assignable[seatIdx] ?? assignable[assignable.length - 1] ?? 1;
    seatIdx += 1;
  });
}

export function reassignSeatsForTables(guests, tableNums, tableSettings) {
  [...new Set(tableNums.map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n) && n >= 1))]
    .forEach((tableNum) => reassignSeatsForTable(guests, tableNum, tableSettings));
}

export function getSmallestAvailableSeat(tableNum, guest, allGuests, tableSettings) {
  const reserved = getReservedSeatsForTable(allGuests, tableNum);
  allGuests.forEach((g) => {
    if (g === guest || g.isCanceled || g.table !== tableNum) return;
    const sort = parseInt(g.sort, 10);
    if (!Number.isNaN(sort) && sort >= 1) reserved.add(sort);
  });
  const assignable = getAssignableSeatsForTable(tableNum, reserved, tableSettings);
  return assignable[0] ?? 1;
}

export function onGuestTableChange(guest, allGuests, tableSettings) {
  const tableRaw = guest.table;
  const tableNum = parseInt(tableRaw, 10);
  if (tableRaw === '' || tableRaw == null || Number.isNaN(tableNum)) {
    guest.table = '';
    guest.sort = 99;
    return;
  }
  guest.table = tableNum;
  if (guest.isCanceled) return;
  guest.sort = getSmallestAvailableSeat(tableNum, guest, allGuests, tableSettings);
}

/** Firebase rules expect `group` as a non-empty string (pipe-separated tags). */
export function serializeGroupForFirebase(group) {
  const tags = normalizeTags(group);
  return tags.length ? tags.join('|') : '未分類';
}

export function serializeGuestsForSave(guests) {
  const wedding = {};
  const unassigned = [];

  guests.forEach((g) => {
    if (!g.name?.trim()) return;
    const row = {
      id: g.id,
      name: g.name.trim(),
      side: g.side,
      [PRIMARY_TAG_KEY]: serializeGroupForFirebase(g.group),
    };
    if (g.table === '' || g.table == null || Number.isNaN(g.table)) {
      row.sort = 99;
      unassigned.push(row);
    } else {
      const targetTable = parseInt(g.table, 10);
      if (!wedding[targetTable]) wedding[targetTable] = [];
      let seatNum;
      if (g.isCanceled) {
        const preserved = parseInt(g.preservedSort, 10);
        seatNum = !Number.isNaN(preserved) && preserved >= 1 ? preserved : parseInt(g.sort, 10);
      } else {
        seatNum = parseInt(g.sort, 10);
      }
      if (Number.isNaN(seatNum) || seatNum < 1) seatNum = 1;
      row.sort = Math.min(ABSOLUTE_MAX_SEATS, seatNum);
      wedding[targetTable].push(row);
    }
  });

  return { wedding, unassigned };
}

/** 儲存 wedding_guests（PocketBase tenant_data） */
export async function syncWeddingGuestsForSave(tenantId, wedding) {
  await pbSyncWeddingGuests(tenantId, wedding);
}

export function exportGuestsToCSV(guests) {
  const headers = ['順序', '桌號', '座位', '姓名', '來源(男方/女方)', '標籤(多選以;分隔)'];
  let csvContent = `\uFEFF${headers.join(',')}\n`;
  let seq = 0;

  guests.forEach((g) => {
    if (!g.name?.trim()) return;
    seq += 1;
    const table = g.table === '' || g.table == null ? '' : String(g.table);
    const seat = g.isCanceled ? '已釋放' : (g.table ? String(g.sort || 1) : '');
    const tags = normalizeTags(g.group).join(';');
    const rowCells = [
      `"${seq}"`,
      `"${table}"`,
      `"${seat}"`,
      `"${g.name.trim()}"`,
      `"${g.side}"`,
      `"${tags}"`,
    ];
    csvContent += `${rowCells.join(',')}\n`;
  });

  return csvContent;
}

export function downloadCsv(content, filename = 'wedding_guests_export.csv') {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export function mergeCategoriesFromGuests(categories, guests) {
  const pool = new Set(categories);
  guests.forEach((g) => {
    normalizeTags(g.group).forEach((t) => pool.add(t));
  });
  return [...pool];
}

export function findGuestsUsingTag(guests, tag) {
  return guests.filter((g) => normalizeTags(g.group).includes(tag));
}
