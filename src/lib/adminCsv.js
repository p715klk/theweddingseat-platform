import { normalizeTags } from '@/lib/guestUtils';
import {
  guestIdentityKey,
  normalizeGuestForList,
  sortGuestsListByTableAndSeat,
} from '@/lib/adminGuestModel';

export function normalizeCSVHeaderLabel(label) {
  return String(label || '')
    .replace(/^"|"$/g, '')
    .replace(/\s/g, '')
    .toLowerCase();
}

export function buildCSVColumnMap(headers) {
  const map = {};
  headers.forEach((raw, index) => {
    const h = normalizeCSVHeaderLabel(raw);
    if (!h) return;
    if (h === '順序' || h === '顺序' || h === 'seq' || h === 'order' || h === '#') map.seq = index;
    if (/桌號|桌号|枱號|枱号|分配桌次|^table$/.test(h)) map.table = index;
    if (/^座位$|^座號$|^座号$|^seat$|^sort$/.test(h)) map.seat = index;
    if (h === '姓名' || h === 'name') map.name = index;
    if (/來源|来源|男方|女方|^side$/.test(h)) map.side = index;
    if (/標籤|标签|群組|群组|^group$|^tag/.test(h)) map.tags = index;
  });
  return map;
}

export function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result.map((s) => s.trim());
}

function formatGuestTagsLabel(tags) {
  const list = normalizeTags(tags);
  return list.length ? list.join('、') : '（無標籤）';
}

function dedupeImportedGuestsLastWins(importedGuests) {
  const map = new Map();
  importedGuests.forEach((guest) => map.set(guestIdentityKey(guest), guest));
  return [...map.values()];
}

function parseImportedGuestFromCSVRow(parts, colMap) {
  const clean = (idx) => {
    if (idx == null || idx < 0) return '';
    return (parts[idx] ?? '').replace(/^"|"$/g, '').trim();
  };

  const name = clean(colMap.name);
  if (!name) return null;

  const sideRaw = clean(colMap.side);
  const side = sideRaw === '女方' ? '女方' : (sideRaw === '男方' ? '男方' : (sideRaw || '男方'));

  const tableRaw = clean(colMap.table);
  const seatRaw = clean(colMap.seat);
  const seatReleased = /已釋放|released/i.test(seatRaw);
  const tableNum = parseInt(tableRaw, 10);
  const seatNum = parseInt(seatRaw, 10);
  const hasTable = tableRaw !== '' && !Number.isNaN(tableNum) && tableNum >= 1;
  const hasSeat = !seatReleased && seatRaw !== '' && !Number.isNaN(seatNum) && seatNum >= 1;

  return {
    name,
    side,
    table: hasTable ? tableNum : '',
    sort: hasTable ? (hasSeat ? seatNum : 1) : 99,
    group: normalizeTags(clean(colMap.tags)),
    seatReleased,
  };
}

function diffGuestPlacement(before, after) {
  const changes = [];
  const beforeTable = before.table === '' || before.table == null ? '未分配' : `第 ${before.table} 桌`;
  const afterTable = after.table === '' || after.table == null ? '未分配' : `第 ${after.table} 桌`;
  if (String(before.table) !== String(after.table)) {
    changes.push(`枱位 ${beforeTable} → ${afterTable}`);
  }
  const beforeSeat = before.isCanceled ? '已釋放' : String(before.sort || 1);
  const afterSeat = after.isCanceled ? '已釋放' : String(after.sort || 1);
  if (before.table && after.table && beforeSeat !== afterSeat) {
    changes.push(`座位 ${beforeSeat} → ${afterSeat}`);
  }
  return changes;
}

function mergeImportedOverExisting(existing, incoming) {
  const merged = {
    ...existing,
    name: incoming.name,
    side: incoming.side,
    group: [...incoming.group],
  };

  if (existing.isCanceled && incoming.seatReleased) {
    merged.table = incoming.table !== '' && incoming.table != null ? incoming.table : existing.table;
    merged.sort = existing.preservedSort ?? existing.sort;
    merged.isCanceled = true;
    merged.preservedSort = existing.preservedSort ?? existing.sort;
  } else {
    merged.table = incoming.table;
    merged.sort = incoming.sort;
    merged.isCanceled = existing.isCanceled;
    merged.preservedSort = existing.preservedSort;
  }

  return merged;
}

function findDuplicateImportKeys(importedGuests) {
  const seen = new Map();
  const duplicates = [];
  importedGuests.forEach((guest, index) => {
    const key = guestIdentityKey(guest);
    if (seen.has(key)) {
      duplicates.push({
        row: index + 1,
        name: guest.name,
        side: guest.side,
        tags: formatGuestTagsLabel(guest.group),
      });
    } else {
      seen.set(key, index);
    }
  });
  return duplicates;
}

export function buildCSVImportPlan(importedGuests, existingGuests, mode) {
  const existing = existingGuests.map((g) => normalizeGuestForList(g));
  const importedRaw = importedGuests.map((g) => normalizeGuestForList(g));
  const duplicates = findDuplicateImportKeys(importedRaw);
  const imported = dedupeImportedGuestsLastWins(importedRaw);
  const existingByKey = new Map();

  existing.forEach((guest) => {
    existingByKey.set(guestIdentityKey(guest), guest);
  });

  const importedKeys = new Set();
  const added = [];
  const updated = [];
  const unchanged = [];
  const resultByKey = new Map();

  if (mode === 'merge') {
    existing.forEach((guest) => {
      resultByKey.set(guestIdentityKey(guest), { ...guest });
    });
  }

  imported.forEach((incoming) => {
    const key = guestIdentityKey(incoming);
    importedKeys.add(key);
    const before = existingByKey.get(key);

    if (!before) {
      added.push(incoming);
      resultByKey.set(key, { ...incoming });
      return;
    }

    const merged = mergeImportedOverExisting(before, incoming);
    const changes = diffGuestPlacement(before, merged);
    if (changes.length) {
      updated.push({ before, after: merged, changes });
    } else {
      unchanged.push(merged);
    }
    resultByKey.set(key, merged);
  });

  const kept = mode === 'merge'
    ? existing.filter((guest) => !importedKeys.has(guestIdentityKey(guest)))
    : [];
  const removed = mode === 'replace'
    ? existing.filter((guest) => !importedKeys.has(guestIdentityKey(guest)))
    : [];

  const resultGuests = mode === 'replace'
    ? sortGuestsListByTableAndSeat(imported.map((guest) => ({ ...guest })))
    : sortGuestsListByTableAndSeat([...resultByKey.values()].map((guest) => ({ ...guest })));

  const assignedCount = resultGuests.filter((g) => g.table !== '' && g.table != null).length;

  return {
    mode,
    resultGuests,
    duplicates,
    preview: { added, updated, unchanged, kept, removed },
    stats: {
      csvTotal: imported.length,
      existingTotal: existing.length,
      resultTotal: resultGuests.length,
      added: added.length,
      updated: updated.length,
      unchanged: unchanged.length,
      kept: kept.length,
      removed: removed.length,
      assigned: assignedCount,
      unassigned: resultGuests.length - assignedCount,
    },
  };
}

export function parseCSVFileContent(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) {
    return { error: '❌ CSV 檔案是空的。' };
  }

  const headerParts = parseCSVLine(lines[0].trim());
  let colMap = buildCSVColumnMap(headerParts);
  const firstDataParts = lines.length > 1 ? parseCSVLine(lines[1].trim()) : [];

  if (colMap.name == null) {
    const looksLikeNewExport = firstDataParts.length >= 4
      && !Number.isNaN(parseInt(firstDataParts[0], 10))
      && !Number.isNaN(parseInt(firstDataParts[1], 10));
    if (looksLikeNewExport) {
      colMap = { seq: 0, table: 1, seat: 2, name: 3, side: 4, tags: 5 };
    } else {
      colMap = { name: 0, side: 1, tags: 2, table: 3 };
    }
  }

  const dataStartIndex = colMap.name != null && buildCSVColumnMap(headerParts).name != null ? 1 : 0;
  const importedGuests = [];

  for (let i = dataStartIndex; i < lines.length; i += 1) {
    const parts = parseCSVLine(lines[i].trim());
    const guest = parseImportedGuestFromCSVRow(parts, colMap);
    if (guest) importedGuests.push(guest);
  }

  if (importedGuests.length === 0) {
    return {
      error: '❌ 未能讀取任何賓客資料，請確認 CSV 格式是否正確。\n\n預期表頭包含：桌號、座位、姓名（或舊版：姓名、分配桌次）',
    };
  }

  return { importedGuests };
}

export function buildCSVImportSuccessMessage(plan) {
  const { stats, mode } = plan;
  const modeLabel = mode === 'merge' ? '合併匯入' : '完全取代';
  let message = `✅ 已${modeLabel}並同步 ${stats.resultTotal} 位賓客至 Firebase！\n\n`;
  message += `• CSV 讀取：${stats.csvTotal} 位\n`;
  message += `• 新增：${stats.added} 位\n`;
  message += `• 更新：${stats.updated} 位\n`;
  message += `• 不變：${stats.unchanged} 位\n`;
  if (mode === 'merge') {
    message += `• 保留（CSV 冇寫到）：${stats.kept} 位\n`;
  } else {
    message += `• 刪除（CSV 冇寫到）：${stats.removed} 位\n`;
  }
  message += `• 已分配枱位：${stats.assigned} 位\n`;
  message += `• 未分配：${stats.unassigned} 位\n\n畫布排位頁面亦會更新。`;
  return message;
}
