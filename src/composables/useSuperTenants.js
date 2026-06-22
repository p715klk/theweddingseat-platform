import { ref as dbRef, get, set, update } from '@/rtdb';
import { database } from '@/firebase';
import { buildDefaultTableSettings, buildFloorPlanFromTableSettings } from '@/lib/guestUtils';
import {
  assertPlatformAdmin,
  createAuthUserForEmail,
  buildUserProfile,
  buildMemberProvisionUpdates,
  normalizeEmail,
  normalizePassword,
  assertPassword,
} from '@/lib/superAdminProvisioning';
import { DEFAULT_TENANT_FEATURES } from '@/lib/tenantFeatures';
import { callRemoveTenantMember } from '@/lib/removeTenantMemberCallable';

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

/** 輸入階段狀態：duplicate check 只應對 phase === 'ready' 嘅 normalized slug */
export function getSlugInputState(rawInput) {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) {
    return { phase: 'idle', normalized: '' };
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('-')) {
    return {
      phase: 'incomplete',
      normalized: normalizeSlug(rawInput),
      message: 'Slug 唔可以以連字號開頭',
    };
  }
  if (lower.endsWith('-')) {
    return {
      phase: 'incomplete',
      normalized: normalizeSlug(rawInput),
      message: '連字號後仲要輸入字元（結尾嘅 - 唔會計入 slug）',
    };
  }

  const normalized = normalizeSlug(rawInput);
  if (!normalized) {
    return { phase: 'idle', normalized: '' };
  }
  if (!isValidSlug(normalized)) {
    return { phase: 'invalid', normalized };
  }
  return { phase: 'ready', normalized };
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

export async function getTenantOwnerProfile(tenantId, ownerUid) {
  const id = String(tenantId || '').trim();
  const uid = String(ownerUid || '').trim();
  if (!id || !uid) return null;
  const snap = await get(dbRef(database, `tenants/${id}/user_profiles/${uid}`));
  return snap.val() || null;
}

const TENANT_DATA_PATHS = [
  'wedding_guests',
  'unassigned_guests',
  'guest_status',
  'table_settings',
  'floor_layout',
  'meta_label_columns',
];

export async function getTenantFullData(tenantId) {
  const id = String(tenantId || '').trim();
  if (!id) throw new Error('缺少 tenantId');
  const snaps = await Promise.all(
    TENANT_DATA_PATHS.map((path) => get(dbRef(database, `tenants/${id}/${path}`))),
  );
  const [
    weddingGuestsSnap,
    unassignedSnap,
    guestStatusSnap,
    tableSettingsSnap,
    floorLayoutSnap,
    labelColumnsSnap,
  ] = snaps;
  const defaultTableSettings = buildDefaultTableSettings();
  return {
    wedding_guests: weddingGuestsSnap.val() ?? {},
    unassigned_guests: unassignedSnap.val() ?? [],
    guest_status: guestStatusSnap.val() ?? {},
    table_settings: tableSettingsSnap.val() ?? defaultTableSettings,
    floor_layout: floorLayoutSnap.val() ?? buildFloorPlanFromTableSettings(defaultTableSettings),
    meta_label_columns: labelColumnsSnap.val() ?? DEFAULT_LABEL_COLUMNS,
  };
}

export async function suggestCloneSlug(sourceSlug) {
  const base = normalizeSlug(sourceSlug);
  if (!base) return '';
  let candidate = `${base}-copy`;
  if (!(await isSlugTaken(candidate))) return candidate;
  let n = 2;
  while (n < 100) {
    candidate = `${base}-copy-${n}`;
    if (!(await isSlugTaken(candidate))) return candidate;
    n += 1;
  }
  throw new Error('無法產生可用 slug，請手動輸入');
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

export async function createTenantMemberUser({
  tenantId,
  email,
  password,
  displayName = '',
  editor = null,
}) {
  const id = String(tenantId || '').trim();
  if (!id) throw new Error('缺少 tenantId');
  await assertPlatformAdmin(editor);
  const { uid, email: trimmedEmail, password: pw } = await createAuthUserForEmail({ email, password });
  const now = Date.now();
  const profile = buildUserProfile({
    email: trimmedEmail,
    displayName,
    initialPassword: pw,
    editor,
    now,
  });
  await update(dbRef(database), buildMemberProvisionUpdates({ tenantId: id, uid, profile, editor, now }));
  return { uid, email: trimmedEmail };
}

export async function getTenantUserProfiles(tenantId) {
  const id = String(tenantId || '').trim();
  if (!id) throw new Error('缺少 tenantId');
  const snap = await get(dbRef(database, `tenants/${id}/user_profiles`));
  return snap.val() || {};
}

export async function setTenantMemberProfile(tenantId, uid, patch, editor = null) {
  const id = String(tenantId || '').trim();
  const u = String(uid || '').trim();
  if (!id || !u) throw new Error('缺少 tenantId 或 uid');
  const now = Date.now();
  const current = (await get(dbRef(database, `tenants/${id}/user_profiles/${u}`))).val() || {};
  await set(dbRef(database, `tenants/${id}/user_profiles/${u}`), {
    ...current,
    ...patch,
    ...(current.created_at ? {} : { created_at: now }),
    ...(current.created_by_uid ? {} : { created_by_uid: editor?.uid || '' }),
    ...(current.created_by_email ? {} : { created_by_email: editor?.email || '' }),
  });
  if (editor?.uid) {
    await update(dbRef(database, `tenants/${id}/meta`), auditFields(editor));
  }
}

export async function removeTenantMember(tenantId, uid) {
  const id = String(tenantId || '').trim();
  const u = String(uid || '').trim();
  if (!id || !u) throw new Error('缺少 tenantId 或 uid');
  return callRemoveTenantMember({ tenantId: id, uid: u });
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
  ownerEmail = '',
  ownerPassword = '',
  ownerDisplayName = '',
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
  const trimmedEmail = normalizeEmail(ownerEmail);
  if (!trimmedEmail) throw new Error('請輸入 Owner Email');
  const pw = normalizePassword(ownerPassword);
  assertPassword(pw);
  await assertPlatformAdmin(editor);
  const created = await createAuthUserForEmail({ email: trimmedEmail, password: pw });
  const resolvedOwnerUid = created.uid || ownerUid?.trim() || editor?.uid || '';
  const meta = {
    couple_names: coupleNames.trim(),
    venue_name: venueName.trim(),
    venue_hall: venueHall.trim(),
    wedding_date: weddingDate,
    theme_color: themeColor,
    status: 'active',
    features: { ...DEFAULT_TENANT_FEATURES },
    slug: normalized,
    plan,
    ...(resolvedOwnerUid ? { owner_uid: resolvedOwnerUid } : {}),
    ...auditFields(editor, { isCreate: true }),
  };

  const tenantBase = `tenants/${tenantId}`;
  const defaultTableSettings = buildDefaultTableSettings();
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

  if (resolvedOwnerUid) {
    const now = Date.now();
    const profile = buildUserProfile({
      email: trimmedEmail,
      displayName: ownerDisplayName,
      initialPassword: pw,
      editor,
      now,
    });
    Object.assign(
      updates,
      buildMemberProvisionUpdates({
        tenantId,
        uid: resolvedOwnerUid,
        profile,
        editor,
        now,
        includeMetaPaths: false,
      }),
    );
  }

  await update(dbRef(database), updates);

  return {
    tenantId,
    slug: normalized,
    checkInUrl: `/p/${normalized}`,
    adminUrl: `/p/${normalized}/admin`,
    ownerUid: resolvedOwnerUid,
    ownerEmail: trimmedEmail,
  };
}

export async function setAuthUserPassword({ uid, newPassword }) {
  throw new Error('此環境未啟用 Cloud Functions，無法直接重設其他用戶密碼。請改用 Firebase Console。');
}

/**
 * 複製現有 tenant 為新 Project（含賓客、枱位、標籤等；members 預設不複製）
 */
export async function cloneTenant({
  sourceTenantId,
  slug,
  coupleNames,
  venueName,
  venueHall,
  weddingDate,
  themeColor = '#b91c1c',
  plan = 'standard',
  ownerUid = '',
  ownerEmail = '',
  ownerPassword = '',
  ownerDisplayName = '',
  editor = null,
}) {
  const normalized = normalizeSlug(slug);
  if (!isValidSlug(normalized)) {
    throw new Error('Slug 格式無效（用小寫英文、數字、連字號，例如 chen-wong-20260915）');
  }
  if (await isSlugTaken(normalized)) {
    throw new Error(`Slug「${normalized}」已被使用`);
  }

  const sourceData = await getTenantFullData(sourceTenantId);
  const tenantId = normalized;
  const trimmedEmail = normalizeEmail(ownerEmail);
  if (!trimmedEmail) throw new Error('請輸入 Owner Email');
  const pw = normalizePassword(ownerPassword);
  assertPassword(pw);
  await assertPlatformAdmin(editor);
  const created = await createAuthUserForEmail({ email: trimmedEmail, password: pw });
  const resolvedOwnerUid = created.uid || ownerUid?.trim() || editor?.uid || '';
  const meta = {
    couple_names: coupleNames.trim(),
    venue_name: venueName.trim(),
    venue_hall: venueHall.trim(),
    wedding_date: weddingDate,
    theme_color: themeColor,
    status: 'active',
    features: { ...DEFAULT_TENANT_FEATURES },
    slug: normalized,
    plan,
    ...(resolvedOwnerUid ? { owner_uid: resolvedOwnerUid } : {}),
    ...auditFields(editor, { isCreate: true }),
  };

  const tenantBase = `tenants/${tenantId}`;
  const updates = {
    [`slugs/${normalized}`]: tenantId,
    [`${tenantBase}/meta`]: meta,
    [`${tenantBase}/wedding_guests`]: sourceData.wedding_guests,
    [`${tenantBase}/unassigned_guests`]: sourceData.unassigned_guests,
    [`${tenantBase}/guest_status`]: sourceData.guest_status,
    [`${tenantBase}/table_settings`]: sourceData.table_settings,
    [`${tenantBase}/floor_layout`]: sourceData.floor_layout,
    [`${tenantBase}/meta_label_columns`]: sourceData.meta_label_columns,
  };

  if (resolvedOwnerUid) {
    const now = Date.now();
    const profile = buildUserProfile({
      email: trimmedEmail,
      displayName: ownerDisplayName,
      initialPassword: pw,
      editor,
      now,
    });
    Object.assign(
      updates,
      buildMemberProvisionUpdates({
        tenantId,
        uid: resolvedOwnerUid,
        profile,
        editor,
        now,
        includeMetaPaths: false,
      }),
    );
  }

  await update(dbRef(database), updates);

  return {
    tenantId,
    slug: normalized,
    checkInUrl: `/p/${normalized}`,
    adminUrl: `/p/${normalized}/admin`,
    ownerUid: resolvedOwnerUid,
    ownerEmail: trimmedEmail,
  };
}

export async function setTenantStatus(tenantId, status, editor = null) {
  const checkin = status !== 'expired';
  await updateTenantMeta(
    tenantId,
    {
      status,
      features: { checkin, guestlist: true, seating: true },
    },
    editor,
  );
}

export async function setTenantFeatures(tenantId, features, editor = null) {
  const normalized = {
    checkin: features?.checkin !== false,
    guestlist: features?.guestlist !== false,
    seating: features?.seating !== false,
  };
  await updateTenantMeta(
    tenantId,
    {
      features: normalized,
      status: normalized.checkin ? 'active' : 'expired',
    },
    editor,
  );
}

/** 永久刪除 tenant（含 slug 對應及所有資料） */
export async function deleteTenant(slug, tenantId) {
  const trimmedSlug = String(slug || '').trim();
  const id = String(tenantId || '').trim();
  if (!trimmedSlug || !id) throw new Error('缺少 slug 或 tenantId');
  await update(dbRef(database), {
    [`slugs/${trimmedSlug}`]: null,
    [`tenants/${id}`]: null,
  });
}
