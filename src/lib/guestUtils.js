export const DEFAULT_MAX_SEATS = 12;
export const ABSOLUTE_MAX_SEATS = 99;
export const PRIMARY_TAG_KEY = 'group';

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
