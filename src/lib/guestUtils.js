export const DEFAULT_MAX_SEATS = 12;
export const ABSOLUTE_MAX_SEATS = 99;
export const PRIMARY_TAG_KEY = 'group';
/** 新 Project 預設枱數（0 = 無枱，由畫布手動新增） */
export const DEFAULT_INITIAL_TABLE_COUNT = 1;

export function normalizeTags(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((t) => String(t).trim()).filter((t) => t && t !== '未分類');
  const s = String(val).trim();
  if (!s || s === '未分類') return [];
  if (s.includes('|')) return s.split('|').map((t) => t.trim()).filter((t) => t && t !== '未分類');
  if (s.includes(';')) return s.split(';').map((t) => t.trim()).filter((t) => t && t !== '未分類');
  return [s];
}

export function normalizeTableSettings(raw) {
  const normalized = {};
  if (!raw) return normalized;
  const entries = Array.isArray(raw)
    ? raw.map((settings, idx) => [String(idx), settings])
    : Object.entries(raw);
  entries.forEach(([key, settings]) => {
    const tableNum = parseInt(key, 10);
    if (!tableNum || tableNum < 1 || !settings || typeof settings !== 'object') return;
    if (settings.x == null || settings.y == null) return;
    normalized[String(tableNum)] = settings;
  });
  return normalized;
}

export function parseArrivedStatus(raw) {
  if (raw === '取消') return '取消';
  if (raw === true || raw === '已到') return '已到';
  return '未到';
}

export function guestStatusKey(table, name) {
  return `${table}_${name}`;
}

export const TABLE_DIM = 420;
export const FLOOR_PLAN_PADDING = 20;
export const FLOOR_TABLE_PX = 80;
export const FLOOR_CANVAS_SCALE = FLOOR_TABLE_PX / TABLE_DIM;

export function buildFloorPlanFromTableSettings(settings) {
  const normalized = normalizeTableSettings(settings);
  const nums = Object.keys(normalized);
  if (!nums.length) {
    return { mode: 'coords', tableSize: TABLE_DIM, items: [], bounds: null };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const items = nums.map((num) => {
    const s = normalized[num];
    const x = Number(s.x);
    const y = Number(s.y);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + TABLE_DIM);
    maxY = Math.max(maxY, y + TABLE_DIM);
    return { num: String(num), x, y };
  });

  const pad = FLOOR_PLAN_PADDING;
  return {
    mode: 'coords',
    tableSize: TABLE_DIM,
    items,
    bounds: {
      minX: minX - pad,
      minY: minY - pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
    },
  };
}

/** 預設 N 枱網格（新 project 建立時） */
export function buildDefaultTableSettings(tableCount = DEFAULT_INITIAL_TABLE_COUNT) {
  if (!tableCount || tableCount < 1) return {};
  const arr = [null];
  const cols = 4;
  const gapX = 440;
  const gapY = 460;
  const startX = 1640;
  const startY = 1100;
  for (let i = 1; i <= tableCount; i += 1) {
    arr[i] = {
      max_seats: DEFAULT_MAX_SEATS,
      x: startX + ((i - 1) % cols) * gapX,
      y: startY + Math.floor((i - 1) / cols) * gapY,
    };
  }
  return arr;
}

function newDefaultGuestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** 新 Project 預設賓客（Bride/Groom 示範列，方便匯出 CSV 後批次修改） */
export function buildDefaultStarterGuestsPayload() {
  return {
    wedding_guests: {
      1: [
        { id: newDefaultGuestId(), name: 'Groom', side: '男方', group: '家人', sort: 1 },
        { id: newDefaultGuestId(), name: 'Bride', side: '女方', group: '家人', sort: 2 },
      ],
    },
    unassigned_guests: [],
    guest_status: {},
  };
}

function layoutItemsBounds(items) {
  if (!items.length) {
    return { mode: 'coords', tableSize: TABLE_DIM, items: [], bounds: null };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  items.forEach((item) => {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + TABLE_DIM);
    maxY = Math.max(maxY, item.y + TABLE_DIM);
  });
  const pad = FLOOR_PLAN_PADDING;
  return {
    mode: 'coords',
    tableSize: TABLE_DIM,
    items,
    bounds: {
      minX: minX - pad,
      minY: minY - pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
    },
  };
}

/** 從畫布同步嘅 floor_layout 建立平面圖（與 legacy seating.js 一致） */
export function buildFloorPlanFromFloorLayout(layout) {
  if (!layout || layout.mode !== 'coords' || !Array.isArray(layout.items) || !layout.items.length) {
    return null;
  }
  const items = layout.items
    .map((item) => ({
      num: String(item.num),
      x: Number(item.x),
      y: Number(item.y),
    }))
    .filter((item) => item.num && Number.isFinite(item.x) && Number.isFinite(item.y));
  if (!items.length) return null;
  if (layout.bounds?.width && layout.bounds?.height) {
    return {
      mode: 'coords',
      tableSize: Number(layout.tableSize) || TABLE_DIM,
      items,
      bounds: {
        minX: Number(layout.bounds.minX),
        minY: Number(layout.bounds.minY),
        width: Number(layout.bounds.width),
        height: Number(layout.bounds.height),
      },
    };
  }
  return layoutItemsBounds(items);
}

/** 點名頁：同 legacy index_script.js — 直接用 table_settings x/y；無則按賓客枱號排版 */
export function buildCheckInFloorPlan(weddingGuests, tableSettings) {
  const fromSettings = buildFloorPlanFromTableSettings(tableSettings);
  if (fromSettings.items.length) return fromSettings;

  const tableNums = Object.keys(weddingGuests || {})
    .map((k) => parseInt(k, 10))
    .filter((n) => n >= 1)
    .sort((a, b) => a - b);
  if (!tableNums.length) return fromSettings;

  const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(tableNums.length))));
  const gapX = 440;
  const gapY = 460;
  const startX = 200;
  const startY = 200;
  const items = tableNums.map((num, i) => ({
    num: String(num),
    x: startX + (i % cols) * gapX,
    y: startY + Math.floor(i / cols) * gapY,
  }));
  return layoutItemsBounds(items);
}

export function guestMatchesKeyword(guest, keyword, statusState) {
  const query = keyword.trim().toLowerCase();
  if (!query) return false;

  const name = (guest.name || '').toLowerCase();
  const side = (guest.side || '').toLowerCase();
  const tags = normalizeTags(guest.group).map((t) => t.toLowerCase());
  const fields = new Set([name, side, ...tags].filter(Boolean));

  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    return tokens.every((token) => [...fields].some((f) => f.includes(token)));
  }
  return [...fields].some((f) => f.includes(query));
}
