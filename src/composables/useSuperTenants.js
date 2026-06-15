import { ref as dbRef, get, set, update } from 'firebase/database';
import { database } from '@/firebase';
import { buildDefaultTableSettings, buildFloorPlanFromTableSettings } from '@/lib/guestUtils';

const DEFAULT_LABEL_COLUMNS = {
  keys: ['group'],
  names: ['標籤 (可多選)'],
  categories: {
    group: ['家人', '男方親戚', '女方親戚', '中學同學'],
  },
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function auditFields(editor, { isCreate = false } = {}) {
  if (!editor?.uid) return {};
  const now = Date.now();
  const fields = {
    updated_at: now,
    updated_by_uid: editor.uid,
    updated_by_email: editor.email || '',
  };
  if (isCreate) {
    fields.created_at = now;
    fields.created_by_uid = editor.uid;
    fields.created_by_email = editor.email || '';
  }
  return fields;
}

export function formatAuditTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('zh-HK');
}

export function normalizeSlug(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function isValidSlug(slug) {
  return slug.length >= 2 && slug.length <= 48 && SLUG_PATTERN.test(slug);
}

export async function listTenants() {
  const slugsSnap = await get(dbRef(database, 'slugs'));
  const slugs = slugsSnap.val() || {};
  const entries = await Promise.all(
    Object.entries(slugs).map(async ([slug, tenantId]) => {
      const id = String(tenantId);
      const metaSnap = await get(dbRef(database, `tenants/${id}/meta`));
      const membersSnap = await get(dbRef(database, `tenants/${id}/members`));
      return {
        tenantId: id,
        slug,
        meta: metaSnap.val() || {},
        members: membersSnap.val() || {},
      };
    }),
  );
  return entries.sort((a, b) => {
    const da = a.meta.wedding_date || '';
    const db = b.meta.wedding_date || '';
    return db.localeCompare(da);
  });
}

export async function getTenantBySlug(slug) {
  const slugSnap = await get(dbRef(database, `slugs/${slug}`));
  if (!slugSnap.exists()) return null;
  const tenantId = String(slugSnap.val());
  const [metaSnap, membersSnap] = await Promise.all([
    get(dbRef(database, `tenants/${tenantId}/meta`)),
    get(dbRef(database, `tenants/${tenantId}/members`)),
  ]);
  if (!metaSnap.exists()) return null;
  return {
    tenantId,
    slug,
    meta: metaSnap.val() || {},
    members: membersSnap.val() || {},
  };
}

export async function updateTenantMeta(tenantId, patch, editor = null) {
  const ref = dbRef(database, `tenants/${tenantId}/meta`);
  const current = (await get(ref)).val() || {};
  await set(ref, {
    ...current,
    ...patch,
    slug: patch.slug ?? current.slug ?? tenantId,
    ...auditFields(editor),
  });
}

export async function renameTenantSlug(tenantId, oldSlug, newSlugInput, editor = null) {
  const newSlug = normalizeSlug(newSlugInput);
  if (!isValidSlug(newSlug)) {
    throw new Error('Slug 格式無效（用小寫英文、數字、連字號）');
  }
  if (newSlug === oldSlug) return newSlug;
  if (await isSlugTaken(newSlug)) {
    throw new Error(`Slug「${newSlug}」已被使用`);
  }

  const metaRef = dbRef(database, `tenants/${tenantId}/meta`);
  const current = (await get(metaRef)).val() || {};

  await update(dbRef(database), {
    [`slugs/${newSlug}`]: tenantId,
    [`slugs/${oldSlug}`]: null,
  });
  await set(metaRef, {
    ...current,
    slug: newSlug,
    ...auditFields(editor),
  });

  return newSlug;
}

export async function addTenantMember(tenantId, uid, editor = null) {
  const trimmed = uid?.trim();
  if (!trimmed) throw new Error('請輸入 UID');
  await set(dbRef(database, `tenants/${tenantId}/members/${trimmed}`), true);
  if (editor) {
    await updateTenantMeta(tenantId, {}, editor);
  }
}

export async function isSlugTaken(slug) {
  const snap = await get(dbRef(database, `slugs/${slug}`));
  return snap.exists();
}

/**
 * 建立新 tenant（Super Admin 用；Auth 帳號仍要 Console 或 Cloud Function 開）
 */
export async function createTenant({
  slug,
  coupleNames,
  venueName,
  venueHall,
  weddingDate,
  themeColor = '#b91c1c',
  plan = 'standard',
  ownerUid = '',
  editor = null,
}) {
  const normalized = normalizeSlug(slug);
  if (!isValidSlug(normalized)) {
    throw new Error('Slug 格式無效（用小寫英文、數字、連字號，例如 chen-wong-20260915）');
  }
  if (await isSlugTaken(normalized)) {
    throw new Error(`Slug「${normalized}」已被使用`);
  }

  const tenantId = normalized;
  const meta = {
    couple_names: coupleNames.trim(),
    venue_name: venueName.trim(),
    venue_hall: venueHall.trim(),
    wedding_date: weddingDate,
    theme_color: themeColor,
    status: 'active',
    slug: normalized,
    plan,
    ...auditFields(editor, { isCreate: true }),
  };

  const tenantBase = `tenants/${tenantId}`;
  const defaultTableSettings = buildDefaultTableSettings(10);
  const defaultFloorLayout = buildFloorPlanFromTableSettings(defaultTableSettings);
  const updates = {
    [`slugs/${normalized}`]: tenantId,
    [`${tenantBase}/meta`]: meta,
    [`${tenantBase}/wedding_guests`]: {},
    [`${tenantBase}/unassigned_guests`]: [],
    [`${tenantBase}/guest_status`]: {},
    [`${tenantBase}/table_settings`]: defaultTableSettings,
    [`${tenantBase}/floor_layout`]: defaultFloorLayout,
    [`${tenantBase}/meta_label_columns`]: DEFAULT_LABEL_COLUMNS,
  };

  if (ownerUid?.trim()) {
    updates[`${tenantBase}/members/${ownerUid.trim()}`] = true;
  } else if (editor?.uid) {
    updates[`${tenantBase}/members/${editor.uid}`] = true;
  }

  await update(dbRef(database), updates);

  return {
    tenantId,
    slug: normalized,
    checkInUrl: `/p/${normalized}`,
    adminUrl: `/p/${normalized}/admin`,
  };
}

export async function setTenantStatus(tenantId, status, editor = null) {
  await updateTenantMeta(tenantId, { status }, editor);
}
