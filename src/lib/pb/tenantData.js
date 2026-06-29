import getPocketBase from '@/lib/pocketbaseClient';
import { pbFilterString } from '@/lib/pb/filter';
import {
  buildDefaultTableSettings,
  buildFloorPlanFromTableSettings,
  buildDefaultStarterGuestsPayload,
} from '@/lib/guestUtils';

const DEFAULT_LABEL_COLUMNS = {
  keys: ['group'],
  names: ['標籤 (可多選)'],
  categories: {
    group: ['家人', '男方親戚', '女方親戚', '中學同學'],
  },
};

/** @type {Map<string, string>} */
const tenantDataIdCache = new Map();

/** @type {Map<string, Promise<any>>} */
const tenantDataEnsureLocks = new Map();

/** @type {Map<string, Promise<void>>} */
const tenantDataWriteLocks = new Map();

async function withTenantDataWriteLock(tenantId, fn) {
  const key = String(tenantId || '').trim();
  const prev = tenantDataWriteLocks.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  tenantDataWriteLocks.set(key, prev.then(() => gate));
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (tenantDataWriteLocks.get(key) === gate) tenantDataWriteLocks.delete(key);
  }
}

export const TENANT_DATA_FIELDS = [
  'wedding_guests',
  'unassigned_guests',
  'guest_status',
  'table_settings',
  'floor_layout',
  'meta_label_columns',
];

function isDuplicateRecordError(err) {
  const msg = String(err?.response?.message || err?.message || '').toLowerCase();
  if (msg.includes('unique') || msg.includes('already exists')) return true;
  try {
    const raw = JSON.stringify(err?.response?.data || {}).toLowerCase();
    return raw.includes('unique') || raw.includes('not_unique');
  } catch {
    return false;
  }
}

function defaultTenantDataPayload(tenantId) {
  const tableSettings = buildDefaultTableSettings();
  const starters = buildDefaultStarterGuestsPayload();
  return {
    tenant_id: tenantId,
    wedding_guests: starters.wedding_guests,
    unassigned_guests: starters.unassigned_guests,
    guest_status: starters.guest_status,
    table_settings: tableSettings,
    floor_layout: buildFloorPlanFromTableSettings(tableSettings),
    meta_label_columns: DEFAULT_LABEL_COLUMNS,
  };
}

export function invalidateTenantDataCache(tenantId) {
  tenantDataIdCache.delete(String(tenantId || '').trim());
}

export async function findTenantDataRecord(tenantId) {
  const key = String(tenantId || '').trim();
  if (!key) return null;
  const pb = getPocketBase();
  const list = await pb.collection('tenant_data').getList(1, 1, {
    filter: `tenant_id = ${pbFilterString(key)}`,
  });
  const record = list.items[0];
  if (record) tenantDataIdCache.set(key, record.id);
  return record || null;
}

export async function ensureTenantDataRecord(tenantId) {
  const key = String(tenantId || '').trim();
  if (!key) throw new Error('missing tenant_id');

  const existing = await findTenantDataRecord(key);
  if (existing) return existing;

  if (tenantDataEnsureLocks.has(key)) {
    return tenantDataEnsureLocks.get(key);
  }

  const work = (async () => {
    const again = await findTenantDataRecord(key);
    if (again) return again;

    const pb = getPocketBase();
    try {
      const created = await pb.collection('tenant_data').create(defaultTenantDataPayload(key));
      tenantDataIdCache.set(key, created.id);
      return created;
    } catch (err) {
      if (isDuplicateRecordError(err)) {
        tenantDataIdCache.delete(key);
        const found = await findTenantDataRecord(key);
        if (found) return found;
      }
      throw err;
    }
  })();

  tenantDataEnsureLocks.set(key, work);
  try {
    return await work;
  } finally {
    tenantDataEnsureLocks.delete(key);
  }
}

export async function deleteTenantDataRecord(recordId, tenantId) {
  const pb = getPocketBase();
  try {
    await pb.collection('tenant_data').delete(recordId);
  } catch (err) {
    console.warn('tenant_data delete skipped:', recordId, err);
  }
  invalidateTenantDataCache(tenantId);
}

export function emptyDataDefaults() {
  return {
    wedding_guests: {},
    unassigned_guests: [],
    guest_status: {},
    table_settings: {},
    floor_layout: {},
    meta_label_columns: DEFAULT_LABEL_COLUMNS,
  };
}

export function recordToDataBundle(record) {
  const defaults = emptyDataDefaults();
  if (!record) return { recordId: null, ...defaults };
  return {
    recordId: record.id,
    wedding_guests: record.wedding_guests ?? defaults.wedding_guests,
    unassigned_guests: record.unassigned_guests ?? defaults.unassigned_guests,
    guest_status: record.guest_status ?? defaults.guest_status,
    table_settings: record.table_settings ?? defaults.table_settings,
    floor_layout: record.floor_layout ?? defaults.floor_layout,
    meta_label_columns: record.meta_label_columns ?? defaults.meta_label_columns,
  };
}

export async function getTenantDataBundle(tenantId) {
  const record = await findTenantDataRecord(tenantId);
  return recordToDataBundle(record);
}

/** 只拉 table_settings（比成條 tenant_data 細好多） */
export async function getTenantTableSettings(tenantId) {
  const key = String(tenantId || '').trim();
  if (!key) return {};
  const pb = getPocketBase();
  const list = await pb.collection('tenant_data').getList(1, 1, {
    filter: `tenant_id = ${pbFilterString(key)}`,
    fields: 'table_settings',
  });
  return list.items[0]?.table_settings ?? {};
}

export async function updateTenantData(tenantId, patch) {
  return withTenantDataWriteLock(tenantId, async () => {
    const record = await ensureTenantDataRecord(tenantId);
    const pb = getPocketBase();
    await pb.collection('tenant_data').update(record.id, patch);
    return record.id;
  });
}

export async function setGuestStatusField(tenantId, statusKey, field, value) {
  const record = await ensureTenantDataRecord(tenantId);
  const guest_status = { ...(record.guest_status || {}) };
  guest_status[statusKey] = { ...(guest_status[statusKey] || {}), [field]: value };
  const pb = getPocketBase();
  await pb.collection('tenant_data').update(record.id, { guest_status });
}

export async function addWeddingGuestAtTable(tenantId, tableNum, guest) {
  const record = await ensureTenantDataRecord(tenantId);
  const table = String(tableNum);
  const wedding_guests = { ...(record.wedding_guests || {}) };
  const list = [...(wedding_guests[table] || [])];
  list.push(guest);
  wedding_guests[table] = list;
  const pb = getPocketBase();
  await pb.collection('tenant_data').update(record.id, { wedding_guests });
}

function listExistingWeddingTableNums(existing) {
  if (!existing) return [];
  if (Array.isArray(existing)) {
    return existing
      .map((row, idx) => (row ? String(idx) : null))
      .filter(Boolean);
  }
  return Object.keys(existing).filter((k) => /^\d+$/.test(k));
}

function normalizeWeddingGuestsMap(wedding) {
  const out = {};
  Object.entries(wedding || {}).forEach(([key, guests]) => {
    const tableNum = parseInt(key, 10);
    if (Number.isNaN(tableNum) || tableNum < 1 || !Array.isArray(guests)) return;
    out[String(tableNum)] = guests;
  });
  return out;
}

export function buildWeddingGuestsForSave(existing, wedding) {
  const wedding_guests = normalizeWeddingGuestsMap(wedding);
  const weddingKeys = new Set(Object.keys(wedding_guests));
  listExistingWeddingTableNums(existing).forEach((tableNum) => {
    if (!weddingKeys.has(String(tableNum))) {
      delete wedding_guests[String(tableNum)];
    }
  });
  return wedding_guests;
}

export async function syncWeddingGuestsForSave(tenantId, wedding) {
  return withTenantDataWriteLock(tenantId, async () => {
    const record = await ensureTenantDataRecord(tenantId);
    const fresh = await findTenantDataRecord(tenantId);
    const existing = fresh?.wedding_guests ?? record.wedding_guests ?? {};
    const wedding_guests = buildWeddingGuestsForSave(existing, wedding);
    const pb = getPocketBase();
    await pb.collection('tenant_data').update(record.id, { wedding_guests });
  });
}

/** Seating / Admin 共用：寫入 wedding_guests + unassigned_guests（不動 meta） */
export async function saveGuestSeatingState(tenantId, { wedding, unassigned }) {
  return withTenantDataWriteLock(tenantId, async () => {
    const record = await ensureTenantDataRecord(tenantId);
    const fresh = await findTenantDataRecord(tenantId);
    const existing = fresh?.wedding_guests ?? record.wedding_guests ?? {};
    const wedding_guests = buildWeddingGuestsForSave(existing, wedding);
    const pb = getPocketBase();
    await pb.collection('tenant_data').update(record.id, {
      wedding_guests,
      unassigned_guests: Array.isArray(unassigned) ? unassigned : [],
    });
    return record.id;
  });
}

/** Admin 賓客名單：單次寫入 wedding_guests + unassigned + meta（避免並行 update 互相覆蓋） */
export async function saveAdminGuestBundle(tenantId, { wedding, unassigned, meta_label_columns }) {
  return withTenantDataWriteLock(tenantId, async () => {
    const record = await ensureTenantDataRecord(tenantId);
    const fresh = await findTenantDataRecord(tenantId);
    const existing = fresh?.wedding_guests ?? record.wedding_guests ?? {};
    const wedding_guests = buildWeddingGuestsForSave(existing, wedding);
    const pb = getPocketBase();
    await pb.collection('tenant_data').update(record.id, {
      wedding_guests,
      unassigned_guests: Array.isArray(unassigned) ? unassigned : [],
      meta_label_columns: meta_label_columns ?? DEFAULT_LABEL_COLUMNS,
    });
    return record.id;
  });
}

export async function patchTenantDataField(tenantId, field, mutator) {
  const record = await ensureTenantDataRecord(tenantId);
  const current = record[field];
  const next = mutator(current);
  const pb = getPocketBase();
  await pb.collection('tenant_data').update(record.id, { [field]: next });
  return next;
}

/**
 * PocketBase 單筆 subscribe(recordId) 用 viewRule；tenant_data viewRule 為空時只有 superuser 收得到事件。
 * 改用 collection 級 subscribe('*')（走 listRule）再 filter，跨裝置 realtime 先會生效。
 */
export function subscribeTenantData(recordId, callback, tenantId = '') {
  if (!recordId && !tenantId) return () => {};
  const pb = getPocketBase();
  const rid = String(recordId || '').trim();
  const tid = String(tenantId || '').trim();
  let unsub = () => {};
  pb.collection('tenant_data')
    .subscribe('*', (e) => {
      const rec = e?.record;
      if (!rec) return;
      if (rid && rec.id === rid) {
        callback(e);
        return;
      }
      if (tid && rec.tenant_id === tid) callback(e);
    })
    .then((fn) => {
      unsub = fn;
    })
    .catch((err) => {
      console.warn('tenant_data realtime subscribe 失敗:', err);
    });
  return () => {
    try {
      unsub();
    } catch {
      /* ignore */
    }
  };
}

export async function subscribeTenantDataByTenantId(tenantId, callback) {
  const record = await ensureTenantDataRecord(tenantId);
  const refresh = async () => {
    const latest = await findTenantDataRecord(tenantId);
    callback(recordToDataBundle(latest));
  };
  await refresh();
  return subscribeTenantData(record.id, refresh, tenantId);
}
