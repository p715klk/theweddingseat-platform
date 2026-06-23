/**
 * PocketBase-backed RTDB compatibility layer.
 * Mimics Firebase compat database API used by @/rtdb composables.
 */
import getPocketBase from '@/lib/pocketbaseClient';

const TENANT_DATA_KEYS = new Set([
  'wedding_guests',
  'unassigned_guests',
  'guest_status',
  'table_settings',
  'floor_layout',
  'meta_label_columns',
]);

const DEFAULT_LABEL_COLUMNS = {
  keys: ['group'],
  names: ['標籤 (可多選)'],
  categories: {
    group: ['家人', '男方親戚', '女方親戚', '中學同學'],
  },
};

/** @type {Map<string, { id: string, slug: string }>} */
const tenantCache = new Map();

/** @type {Map<string, string>} */
const tenantDataIdCache = new Map();

/** path -> Set<callback> */
const listeners = new Map();

/** slug -> unsubscribe fns */
const pbSubscriptions = new Map();

function parsePath(path) {
  return String(path || '')
    .split('/')
    .filter(Boolean);
}

function cloneDeep(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function deepGet(obj, segments) {
  let cur = obj;
  for (const seg of segments) {
    if (cur == null) return undefined;
    cur = cur[seg];
  }
  return cur;
}

function deepSet(obj, segments, value) {
  if (!segments.length) return value;
  const root = obj && typeof obj === 'object' ? { ...obj } : {};
  let cur = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i];
    const next = cur[seg];
    cur[seg] = next && typeof next === 'object' ? { ...next } : {};
    cur = cur[seg];
  }
  cur[segments[segments.length - 1]] = value;
  return root;
}

function deepDelete(obj, segments) {
  if (!obj || !segments.length) return obj;
  const root = { ...obj };
  let cur = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i];
    if (cur[seg] == null) return root;
    cur[seg] = { ...cur[seg] };
    cur = cur[seg];
  }
  delete cur[segments[segments.length - 1]];
  return root;
}

function makeSnapshot(val) {
  const exists = val !== null && val !== undefined;
  return {
    val: () => (exists ? cloneDeep(val) : null),
    exists: () => exists,
  };
}

function notifyPath(path, val) {
  const snap = makeSnapshot(val);
  const set = listeners.get(path);
  if (set) {
    set.forEach((cb) => {
      try {
        cb(snap);
      } catch (e) {
        console.error('RTDB listener error:', path, e);
      }
    });
  }
}

function notifyPrefix(prefix, val) {
  notifyPath(prefix, val);
  for (const [path, set] of listeners.entries()) {
    if (path.startsWith(`${prefix}/`) && set.size) {
      // child listeners refreshed via parent subscription
    }
  }
}

async function findTenantByIdOrSlug(key) {
  const id = String(key || '').trim();
  if (!id) return null;
  if (tenantCache.has(id)) return tenantCache.get(id);

  const pb = getPocketBase();
  const filter = `tenant_id = ${JSON.stringify(id)} || slug = ${JSON.stringify(id)}`;
  const list = await pb.collection('tenants').getList(1, 1, { filter });
  const record = list.items[0];
  if (!record) return null;
  const info = { id: record.id, tenantId: record.tenant_id || record.slug, slug: record.slug };
  tenantCache.set(id, info);
  tenantCache.set(info.tenantId, info);
  if (record.slug) tenantCache.set(record.slug, info);
  return info;
}

async function findTenantBySlug(slug) {
  return findTenantByIdOrSlug(slug);
}

async function findTenantDataRecord(tenantId) {
  const key = String(tenantId || '').trim();
  if (!key) return null;
  if (tenantDataIdCache.has(key)) {
    const pb = getPocketBase();
    return pb.collection('tenant_data').getOne(tenantDataIdCache.get(key));
  }
  const pb = getPocketBase();
  const list = await pb.collection('tenant_data').getList(1, 1, {
    filter: `tenant_id = ${JSON.stringify(key)}`,
  });
  const record = list.items[0];
  if (record) tenantDataIdCache.set(key, record.id);
  return record || null;
}

function tenantToMeta(record) {
  if (!record) return null;
  return {
    couple_names: record.couple_names || '',
    venue_name: record.venue_name || '',
    venue_hall: record.venue_hall || '',
    wedding_date: record.wedding_date || '',
    theme_color: record.theme_color || '#b91c1c',
    status: record.status || 'active',
    slug: record.slug || '',
    plan: record.plan || 'standard',
    owner_uid: record.owner_uid || '',
    features: record.features || { checkin: true, guestlist: true, seating: true },
    created_at: record.created_at || null,
    created_by_uid: record.created_by_uid || '',
    created_by_email: record.created_by_email || '',
    updated_at: record.updated_at || null,
    updated_by_uid: record.updated_by_uid || '',
    updated_by_email: record.updated_by_email || '',
  };
}

function metaToTenantFields(meta, slug, tenantId = slug) {
  return {
    tenant_id: tenantId,
    slug,
    couple_names: meta.couple_names || '',
    venue_name: meta.venue_name || '',
    venue_hall: meta.venue_hall || '',
    wedding_date: meta.wedding_date || '',
    theme_color: meta.theme_color || '#b91c1c',
    status: meta.status || 'active',
    plan: meta.plan || 'standard',
    owner_uid: meta.owner_uid || '',
    features: meta.features || { checkin: true, guestlist: true, seating: true },
    created_at: meta.created_at ?? Date.now(),
    created_by_uid: meta.created_by_uid || '',
    created_by_email: meta.created_by_email || '',
    updated_at: meta.updated_at ?? Date.now(),
    updated_by_uid: meta.updated_by_uid || '',
    updated_by_email: meta.updated_by_email || '',
  };
}

async function listTenantMembers(tenantId) {
  const pb = getPocketBase();
  const list = await pb.collection('tenant_members').getFullList({
    filter: `tenant_id = ${JSON.stringify(tenantId)}`,
  });
  return list;
}

function memberToProfile(m) {
  return {
    email: m.email || '',
    display_name: m.display_name || '',
    ...(m.initial_password ? { initial_password: m.initial_password } : {}),
    created_at: m.created_at || null,
    created_by_uid: m.created_by_uid || '',
    created_by_email: m.created_by_email || '',
  };
}

async function getMembersMap(slug) {
  const rows = await listTenantMembers(slug);
  const map = {};
  rows.forEach((m) => {
    if (m.user_id) map[m.user_id] = m.role === true ? 'admin' : m.role || 'admin';
  });
  return map;
}

async function getProfilesMap(slug) {
  const rows = await listTenantMembers(slug);
  const map = {};
  rows.forEach((m) => {
    if (m.user_id) map[m.user_id] = memberToProfile(m);
  });
  return map;
}

async function getPlatformAdminsMap() {
  const pb = getPocketBase();
  const list = await pb.collection('users').getFullList({
    filter: 'is_platform_admin = true',
  });
  const map = {};
  list.forEach((u) => {
    map[u.id] = true;
  });
  return map;
}

async function getPlatformAdminProfilesMap() {
  const pb = getPocketBase();
  const list = await pb.collection('users').getFullList({
    filter: 'is_platform_admin = true',
  });
  const map = {};
  list.forEach((u) => {
    map[u.id] = {
      email: u.email || '',
      display_name: u.display_name || '',
      ...(u.initial_password ? { initial_password: u.initial_password } : {}),
      created_at: u.created_at || null,
      created_by_uid: u.created_by_uid || '',
      created_by_email: u.created_by_email || '',
    };
  });
  return map;
}

async function getAllSlugsMap() {
  const pb = getPocketBase();
  const list = await pb.collection('tenants').getFullList({ fields: 'slug,tenant_id' });
  const map = {};
  list.forEach((t) => {
    if (t.slug) map[t.slug] = t.tenant_id || t.slug;
  });
  return map;
}

async function readPath(path) {
  const parts = parsePath(path);
  if (!parts.length) return null;

  if (parts[0] === 'slugs') {
    if (parts.length === 1) return getAllSlugsMap();
    const slug = parts[1];
    const tenant = await findTenantBySlug(slug);
    return tenant ? tenant.tenantId : null;
  }

  if (parts[0] === 'platform_admins') {
    if (parts.length === 1) return getPlatformAdminsMap();
    const map = await getPlatformAdminsMap();
    return map[parts[1]] ?? null;
  }

  if (parts[0] === 'platform_admin_profiles') {
    if (parts.length === 1) return getPlatformAdminProfilesMap();
    const map = await getPlatformAdminProfilesMap();
    return map[parts[1]] ?? null;
  }

  if (parts[0] === 'tenants' && parts.length >= 2) {
    const tenantId = parts[1];

    if (parts.length === 2) {
      const tenant = await findTenantByIdOrSlug(tenantId);
      if (!tenant) return null;
      const meta = tenantToMeta(await getPocketBase().collection('tenants').getOne(tenant.id));
      const members = await getMembersMap(tenantId);
      const profiles = await getProfilesMap(tenantId);
      const dataRec = await findTenantDataRecord(tenantId);
      return {
        meta,
        members,
        user_profiles: profiles,
        wedding_guests: dataRec?.wedding_guests ?? {},
        unassigned_guests: dataRec?.unassigned_guests ?? [],
        guest_status: dataRec?.guest_status ?? {},
        table_settings: dataRec?.table_settings ?? {},
        floor_layout: dataRec?.floor_layout ?? {},
        meta_label_columns: dataRec?.meta_label_columns ?? DEFAULT_LABEL_COLUMNS,
      };
    }

    if (parts[2] === 'meta') {
      const tenant = await findTenantByIdOrSlug(tenantId);
      if (!tenant) return null;
      const record = await getPocketBase().collection('tenants').getOne(tenant.id);
      return tenantToMeta(record);
    }

    if (parts[2] === 'members') {
      if (parts.length === 3) return getMembersMap(tenantId);
      const map = await getMembersMap(tenantId);
      return map[parts[3]] ?? null;
    }

    if (parts[2] === 'user_profiles') {
      if (parts.length === 3) return getProfilesMap(tenantId);
      const map = await getProfilesMap(tenantId);
      return map[parts[3]] ?? null;
    }

    if (TENANT_DATA_KEYS.has(parts[2])) {
      const dataRec = await findTenantDataRecord(tenantId);
      const root = dataRec?.[parts[2]];
      if (parts.length === 3) {
        return root ?? (parts[2] === 'unassigned_guests' ? [] : parts[2] === 'meta_label_columns' ? DEFAULT_LABEL_COLUMNS : {});
      }
      const rest = parts.slice(3);
      return deepGet(root, rest);
    }
  }

  return null;
}

async function writePath(path, value) {
  const parts = parsePath(path);
  if (!parts.length) return;

  const pb = getPocketBase();

  if (parts[0] === 'platform_admins' && parts.length === 2) {
    const uid = parts[1];
    if (value === null) {
      await pb.collection('users').update(uid, { is_platform_admin: false });
    } else {
      await pb.collection('users').update(uid, { is_platform_admin: true });
    }
    return;
  }

  if (parts[0] === 'platform_admin_profiles' && parts.length === 2) {
    const uid = parts[1];
    if (value === null) {
      await pb.collection('users').update(uid, {
        display_name: '',
        initial_password: '',
      });
    } else {
      await pb.collection('users').update(uid, {
        display_name: value.display_name || '',
        initial_password: value.initial_password || '',
        created_at: value.created_at || Date.now(),
        created_by_uid: value.created_by_uid || '',
        created_by_email: value.created_by_email || '',
        is_platform_admin: true,
      });
    }
    return;
  }

  if (parts[0] === 'slugs' && parts.length === 2) {
    if (value === null) return;
    const tenant = await findTenantByIdOrSlug(String(value));
    if (tenant) {
      await pb.collection('tenants').update(tenant.id, { slug: parts[1] });
      invalidateTenantCache(tenant.tenantId);
    }
    return;
  }

  if (parts[0] === 'tenants') {
    const tenantId = parts[1];

    if (parts.length === 2) {
      if (value === null) {
        const tenant = await findTenantByIdOrSlug(tenantId);
        if (tenant) {
          const members = await listTenantMembers(tenantId);
          await Promise.all(members.map((m) => pb.collection('tenant_members').delete(m.id)));
          const dataRec = await findTenantDataRecord(tenantId);
          if (dataRec) await pb.collection('tenant_data').delete(dataRec.id);
          await pb.collection('tenants').delete(tenant.id);
          invalidateTenantCache(tenantId);
        }
      }
      return;
    }

    if (parts[2] === 'meta') {
      const tenant = await findTenantByIdOrSlug(tenantId);
      const fields = metaToTenantFields(value || {}, value?.slug || tenantId);
      fields.tenant_id = tenant?.tenantId || tenantId;
      if (tenant) {
        await pb.collection('tenants').update(tenant.id, fields);
        invalidateTenantCache(tenantId);
      } else if (value !== null) {
        const created = await pb.collection('tenants').create(fields);
        tenantCache.set(tenantId, { id: created.id, tenantId, slug: fields.slug });
        await pb.collection('tenant_data').create({
          tenant_id: tenantId,
          wedding_guests: {},
          unassigned_guests: [],
          guest_status: {},
          table_settings: {},
          floor_layout: {},
          meta_label_columns: DEFAULT_LABEL_COLUMNS,
        });
      }
      return;
    }

    if (parts[2] === 'members') {
      if (parts.length === 4) {
        const uid = parts[3];
        const rows = await listTenantMembers(tenantId);
        const existing = rows.find((r) => r.user_id === uid);
        if (value === null) {
          if (existing) await pb.collection('tenant_members').delete(existing.id);
          return;
        }
        const role = value === true ? 'admin' : value;
        if (existing) {
          await pb.collection('tenant_members').update(existing.id, { role });
        } else {
          let email = '';
          try {
            const u = await pb.collection('users').getOne(uid);
            email = u.email || '';
          } catch {
            /* user may not exist yet */
          }
          await pb.collection('tenant_members').create({
            tenant_id: tenantId,
            user_id: uid,
            role,
            email,
            display_name: '',
            created_at: Date.now(),
          });
        }
      }
      return;
    }

    if (parts[2] === 'user_profiles' && parts.length === 4) {
      const uid = parts[3];
      const rows = await listTenantMembers(tenantId);
      const existing = rows.find((r) => r.user_id === uid);
      if (value === null) {
        if (existing) await pb.collection('tenant_members').delete(existing.id);
        return;
      }
      const payload = {
        email: value.email || '',
        display_name: value.display_name || '',
        initial_password: value.initial_password || '',
        created_at: value.created_at || Date.now(),
        created_by_uid: value.created_by_uid || '',
        created_by_email: value.created_by_email || '',
      };
      if (existing) {
        await pb.collection('tenant_members').update(existing.id, payload);
      } else {
        await pb.collection('tenant_members').create({
          tenant_id: tenantId,
          user_id: uid,
          role: 'admin',
          ...payload,
        });
      }
      return;
    }

    if (TENANT_DATA_KEYS.has(parts[2])) {
      const key = parts[2];
      let dataRec = await findTenantDataRecord(tenantId);
      if (!dataRec) {
        dataRec = await pb.collection('tenant_data').create({
          tenant_id: tenantId,
          wedding_guests: {},
          unassigned_guests: [],
          guest_status: {},
          table_settings: {},
          floor_layout: {},
          meta_label_columns: DEFAULT_LABEL_COLUMNS,
        });
        tenantDataIdCache.set(tenantId, dataRec.id);
      }

      let nextValue;
      if (parts.length === 3) {
        nextValue = value;
      } else {
        const current = cloneDeep(dataRec[key]) ?? (key === 'unassigned_guests' ? [] : {});
        const rest = parts.slice(3);
        nextValue = value === null ? deepDelete(current, rest) : deepSet(current, rest, value);
      }

      await pb.collection('tenant_data').update(dataRec.id, { [key]: nextValue });
      return;
    }
  }
}

function ensureTenantSubscription(tenantId) {
  if (pbSubscriptions.has(tenantId)) return;
  const pb = getPocketBase();

  const unsubs = [];

  const refreshData = async () => {
    const paths = [
      `tenants/${tenantId}/wedding_guests`,
      `tenants/${tenantId}/unassigned_guests`,
      `tenants/${tenantId}/guest_status`,
      `tenants/${tenantId}/table_settings`,
      `tenants/${tenantId}/floor_layout`,
      `tenants/${tenantId}/meta_label_columns`,
    ];
    await Promise.all(
      paths.map(async (p) => {
        notifyPath(p, await readPath(p));
      }),
    );
  };

  const refreshMeta = async () => {
    notifyPath(`tenants/${tenantId}/meta`, await readPath(`tenants/${tenantId}/meta`));
  };

  const refreshMembers = async () => {
    notifyPath(`tenants/${tenantId}/members`, await readPath(`tenants/${tenantId}/members`));
    notifyPath(`tenants/${tenantId}/user_profiles`, await readPath(`tenants/${tenantId}/user_profiles`));
  };

  findTenantByIdOrSlug(tenantId).then((tenant) => {
    if (!tenant) return;

    pb.collection('tenants').subscribe(tenant.id, () => {
      refreshMeta();
    }).then((fn) => unsubs.push(fn)).catch(() => {});

    findTenantDataRecord(tenantId).then((dataRec) => {
      if (!dataRec) return;
      pb.collection('tenant_data').subscribe(dataRec.id, () => {
        refreshData();
      }).then((fn) => unsubs.push(fn)).catch(() => {});
    });

    pb.collection('tenant_members').subscribe('*', (e) => {
      if (e.record?.tenant_id === tenantId) refreshMembers();
    }).then((fn) => unsubs.push(fn)).catch(() => {});
  });

  pbSubscriptions.set(tenantId, () => {
    unsubs.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
    pbSubscriptions.delete(tenantId);
  });
}

function subscribePath(path, callback, onError) {
  const parts = parsePath(path);

  const run = async () => {
    try {
      const val = await readPath(path);
      callback(makeSnapshot(val));
    } catch (e) {
      onError?.(e);
    }
  };

  if (!listeners.has(path)) listeners.set(path, new Set());
  listeners.get(path).add(callback);
  run();

  if (parts[0] === 'tenants' && parts.length >= 2) {
    ensureTenantSubscription(parts[1]);
  }

  return () => {
    listeners.get(path)?.delete(callback);
  };
}

export class DbRef {
  constructor(path = '') {
    this._path = String(path || '').replace(/^\/+|\/+$/g, '');
  }

  get key() {
    const parts = parsePath(this._path);
    return parts[parts.length - 1] || null;
  }

  child(segment) {
    const seg = String(segment);
    return new DbRef(this._path ? `${this._path}/${seg}` : seg);
  }

  once(event) {
    if (event !== 'value') return Promise.reject(new Error('Only value events supported'));
    return readPath(this._path).then((val) => makeSnapshot(val));
  }

  set(value) {
    return writePath(this._path, value);
  }

  update(values) {
    if (!this._path) {
      return Promise.all(
        Object.entries(values).map(([p, v]) => writePath(p, v)),
      );
    }
    return readPath(this._path).then(async (current) => {
      const base = current && typeof current === 'object' ? current : {};
      const merged = { ...base, ...values };
      await writePath(this._path, merged);
    });
  }

  remove() {
    return writePath(this._path, null);
  }

  on(event, handler, onError) {
    if (event !== 'value') throw new Error('Only value events supported');
    return subscribePath(this._path, handler, onError);
  }

  off(event, handler) {
    if (event !== 'value') return;
    listeners.get(this._path)?.delete(handler);
  }
}

export const database = {
  ref(path) {
    return new DbRef(path);
  },
};

export function invalidateTenantCache(tenantId) {
  const key = String(tenantId || '').trim();
  tenantDataIdCache.delete(key);
  for (const [k, v] of tenantCache.entries()) {
    if (k === key || v.tenantId === key) tenantCache.delete(k);
  }
}
