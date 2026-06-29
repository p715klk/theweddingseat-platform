import getPocketBase from '@/lib/pocketbaseClient';
import { pbFilterString } from '@/lib/pb/filter';

/** @type {Map<string, { id: string, tenantId: string, slug: string }>} */
const tenantCache = new Map();

export function invalidateTenantCache(tenantKey) {
  const key = String(tenantKey || '').trim();
  if (!key) return;
  const hit = tenantCache.get(key);
  tenantCache.delete(key);
  if (hit) {
    tenantCache.delete(hit.tenantId);
    if (hit.slug) tenantCache.delete(hit.slug);
    tenantCache.delete(hit.id);
  }
}

function cacheTenantInfo(record) {
  if (!record?.id) return null;
  const info = {
    id: record.id,
    tenantId: record.tenant_id || record.slug,
    slug: record.slug || '',
  };
  tenantCache.set(info.id, info);
  tenantCache.set(info.tenantId, info);
  if (info.slug) tenantCache.set(info.slug, info);
  return info;
}

export async function findTenantByIdOrSlug(key) {
  const id = String(key || '').trim();
  if (!id) return null;
  if (tenantCache.has(id)) return tenantCache.get(id);

  const pb = getPocketBase();
  const filter = `tenant_id = ${pbFilterString(id)} || slug = ${pbFilterString(id)}`;
  const list = await pb.collection('tenants').getList(1, 1, { filter });
  const record = list.items[0];
  if (!record) return null;
  return cacheTenantInfo(record);
}

export async function findTenantBySlug(slug) {
  const s = String(slug || '').trim();
  if (!s) return null;

  const pb = getPocketBase();
  const list = await pb.collection('tenants').getList(1, 1, {
    filter: `slug = ${pbFilterString(s)}`,
  });
  const record = list.items[0];
  if (!record) return null;
  return cacheTenantInfo(record);
}

export async function getTenantRecord(recordId, tenantKey = '') {
  const pb = getPocketBase();
  try {
    const list = await pb.collection('tenants').getList(1, 1, {
      filter: `id = ${pbFilterString(recordId)}`,
    });
    if (list.items[0]) return list.items[0];
  } catch {
    /* listRule */
  }
  if (tenantKey) {
    const info = await findTenantByIdOrSlug(tenantKey);
    if (!info) return null;
    const list2 = await pb.collection('tenants').getList(1, 1, {
      filter: `id = ${pbFilterString(info.id)}`,
    });
    return list2.items[0] || null;
  }
  return null;
}

export async function listAllTenantSlugs() {
  const pb = getPocketBase();
  const list = await pb.collection('tenants').getFullList({ fields: 'slug,tenant_id' });
  const map = {};
  list.forEach((t) => {
    if (t.slug) map[t.slug] = t.tenant_id || t.slug;
  });
  return map;
}

export async function listAllTenants() {
  const slugs = await listAllTenantSlugs();
  const entries = await Promise.all(
    Object.entries(slugs).map(async ([slug, tenantId]) => {
      const [meta, members] = await Promise.all([
        getTenantMeta(tenantId),
        import('@/lib/pb/members').then((m) => m.getMembersMap(tenantId)),
      ]);
      return { tenantId, slug, meta: meta || {}, members: members || {} };
    }),
  );
  return entries.sort((a, b) => {
    const da = a.meta?.wedding_date || '';
    const db = b.meta?.wedding_date || '';
    return db.localeCompare(da);
  });
}

export function recordToMeta(record, ownerUid = '') {
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
    owner_uid: ownerUid || record.owner_uid || '',
    features: record.features || { checkin: true, guestlist: true, seating: true },
    created_at: record.created_at || null,
    created_by_uid: record.created_by_uid || '',
    created_by_email: record.created_by_email || '',
    updated_at: record.updated_at || null,
    updated_by_uid: record.updated_by_uid || '',
    updated_by_email: record.updated_by_email || '',
  };
}

export function metaToRecordFields(meta, slug, tenantId = slug) {
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

export async function getTenantMeta(tenantId) {
  const info = await findTenantByIdOrSlug(tenantId);
  if (!info) return null;
  const record = await getTenantRecord(info.id, tenantId);
  if (!record) return null;
  const { resolveOwnerUid } = await import('@/lib/pb/members');
  const ownerUid = await resolveOwnerUid(tenantId, record);
  return recordToMeta(record, ownerUid);
}

export async function getTenantBySlug(slug) {
  const info = await findTenantBySlug(slug);
  if (!info) return null;
  const record = await getTenantRecord(info.id, info.tenantId);
  if (!record) return null;
  const { getMembersMap } = await import('@/lib/pb/members');
  const [meta, members] = await Promise.all([
    getTenantMeta(info.tenantId),
    getMembersMap(info.tenantId),
  ]);
  if (!meta) return null;
  return {
    tenantId: info.tenantId,
    slug,
    recordId: info.id,
    meta,
    members,
  };
}

export async function updateTenantMeta(tenantId, patch) {
  const info = await findTenantByIdOrSlug(tenantId);
  if (!info) throw new Error('找不到專案');
  const record = await getTenantRecord(info.id, tenantId);
  const current = recordToMeta(record, record?.owner_uid) || {};
  const pb = getPocketBase();
  const fields = metaToRecordFields(
    { ...current, ...patch, slug: patch.slug ?? current.slug ?? info.slug },
    patch.slug ?? current.slug ?? info.slug,
    info.tenantId,
  );
  await pb.collection('tenants').update(info.id, fields);
  invalidateTenantCache(info.tenantId);
  if (fields.slug && fields.slug !== info.slug) invalidateTenantCache(info.slug);
}

export async function renameTenantSlug(tenantId, oldSlug, newSlug) {
  const info = await findTenantByIdOrSlug(tenantId);
  if (!info) throw new Error('找不到專案');
  const pb = getPocketBase();
  const dup = await pb.collection('tenants').getList(1, 1, {
    filter: `slug = ${pbFilterString(newSlug)}`,
  });
  if (dup.items[0] && dup.items[0].id !== info.id) {
    throw new Error(`Slug「${newSlug}」已被使用`);
  }
  await pb.collection('tenants').update(info.id, { slug: newSlug });
  invalidateTenantCache(tenantId);
  invalidateTenantCache(oldSlug);
  invalidateTenantCache(newSlug);
  return newSlug;
}

export async function deleteTenantRecord(tenantId) {
  const info = await findTenantByIdOrSlug(tenantId);
  if (!info) return;
  const pb = getPocketBase();
  const { listTenantMembers } = await import('@/lib/pb/members');
  const { findTenantDataRecord, deleteTenantDataRecord } = await import('@/lib/pb/tenantData');
  const { cleanupOrphanedAuthUsers } = await import('@/lib/tenantUserLifecycle');

  const record = await getTenantRecord(info.id, tenantId);
  const members = await listTenantMembers(tenantId);
  const cleanupUids = new Set();
  if (record?.owner_uid) cleanupUids.add(record.owner_uid);
  members.forEach((m) => {
    if (m.user_id) cleanupUids.add(m.user_id);
  });

  for (const m of members) {
    try {
      await pb.collection('tenant_members').delete(m.id);
    } catch (err) {
      console.warn('tenant_members delete skipped:', m.id, err);
    }
  }

  const dataRec = await findTenantDataRecord(tenantId);
  if (dataRec) await deleteTenantDataRecord(dataRec.id, tenantId);

  await pb.collection('tenants').delete(info.id);
  invalidateTenantCache(tenantId);
  await cleanupOrphanedAuthUsers([...cleanupUids]);
}

export function subscribeTenantRecord(recordId, callback) {
  const pb = getPocketBase();
  const rid = String(recordId || '').trim();
  if (!rid) return () => {};
  let unsub = () => {};
  pb.collection('tenants')
    .subscribe('*', (e) => {
      if (e.record?.id === rid) callback();
    })
    .then((fn) => {
      unsub = fn;
    })
    .catch((err) => {
      console.warn('tenants realtime subscribe 失敗:', err);
    });
  return () => {
    try {
      unsub();
    } catch {
      /* ignore */
    }
  };
}
