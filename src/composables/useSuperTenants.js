import { buildDefaultTableSettings, buildFloorPlanFromTableSettings } from '@/lib/guestUtils';
import getPocketBase from '@/lib/pocketbaseClient';
import {
  assertPlatformAdmin,
  createAuthUserForEmail,
  buildUserProfile,
  normalizeEmail,
  normalizePassword,
  assertPassword,
} from '@/lib/superAdminProvisioning';
import { DEFAULT_TENANT_FEATURES } from '@/lib/tenantFeatures';
import { callRemoveTenantMember, callSetUserPassword, callTransferTenantOwner, callUpsertTenantMember, callCreateTenant, isTwsHooksMissingError } from '@/lib/twsApi';
import {
  listAllTenants,
  getTenantBySlug as pbGetTenantBySlug,
  updateTenantMeta as pbUpdateTenantMeta,
  renameTenantSlug as pbRenameTenantSlug,
  deleteTenantRecord,
  findTenantBySlug,
  metaToRecordFields,
} from '@/lib/pb/tenant';
import { getMemberProfile, getMembersMap } from '@/lib/pb/members';
import { getTenantDataBundle } from '@/lib/pb/tenantData';

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
  return listAllTenants();
}

export async function getTenantBySlug(slug) {
  return pbGetTenantBySlug(slug);
}

export async function getTenantOwnerProfile(tenantId, ownerUid) {
  const id = String(tenantId || '').trim();
  const uid = String(ownerUid || '').trim();
  if (!id || !uid) return null;
  return getMemberProfile(id, uid);
}

export async function getTenantFullData(tenantId) {
  const id = String(tenantId || '').trim();
  if (!id) throw new Error('缺少 tenantId');
  const bundle = await getTenantDataBundle(id);
  const defaultTableSettings = buildDefaultTableSettings();
  return {
    wedding_guests: bundle.wedding_guests ?? {},
    unassigned_guests: bundle.unassigned_guests ?? [],
    guest_status: bundle.guest_status ?? {},
    table_settings: bundle.table_settings ?? defaultTableSettings,
    floor_layout: bundle.floor_layout ?? buildFloorPlanFromTableSettings(defaultTableSettings),
    meta_label_columns: bundle.meta_label_columns ?? DEFAULT_LABEL_COLUMNS,
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
  await pbUpdateTenantMeta(tenantId, {
    ...patch,
    ...auditFields(editor),
  });
}

function normalizeMemberRole(val) {
  if (val === 'owner') return 'owner';
  if (val === true || val === 'admin') return 'admin';
  if (val === 'reception') return 'reception';
  return '';
}

function findOwnerUidFromMembers(members, fallbackUid = '') {
  for (const [uid, role] of Object.entries(members || {})) {
    if (normalizeMemberRole(role) === 'owner') return uid;
  }
  return String(fallbackUid || '').trim();
}

/** Super Admin：將 Owner 轉移給現有後台管理員（原 Owner 降為 admin） */
export async function transferTenantOwner(tenantId, newOwnerUid, editor = null) {
  const id = String(tenantId || '').trim();
  const uid = String(newOwnerUid || '').trim();
  if (!id || !uid) throw new Error('請選擇新 Owner');
  await assertPlatformAdmin(editor);

  const members = await getMembersMap(id);
  const { getTenantMeta } = await import('@/lib/pb/tenant');
  const meta = (await getTenantMeta(id)) || {};

  if (normalizeMemberRole(members[uid]) !== 'admin') {
    throw new Error('只能將 Owner 轉移給後台管理員');
  }

  const currentOwnerUid = findOwnerUidFromMembers(members, meta.owner_uid);
  if (currentOwnerUid === uid) {
    return { tenantId: id, ownerUid: uid, changed: false };
  }

  try {
    return await callTransferTenantOwner({ tenantId: id, newOwnerUid: uid });
  } catch (err) {
    if (!isTwsHooksMissingError(err)) throw err;
  }

  await callUpsertTenantMember({ tenantId: id, uid, role: 'owner' });
  if (currentOwnerUid && currentOwnerUid !== uid) {
    await callUpsertTenantMember({ tenantId: id, uid: currentOwnerUid, role: 'admin' });
  }
  await pbUpdateTenantMeta(id, { owner_uid: uid, ...auditFields(editor) });
  return {
    tenantId: id,
    ownerUid: uid,
    previousOwnerUid: currentOwnerUid,
    changed: true,
  };
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

  await pbRenameTenantSlug(tenantId, oldSlug, newSlug);
  await pbUpdateTenantMeta(tenantId, { slug: newSlug, ...auditFields(editor) });
  return newSlug;
}

export async function addTenantMember(tenantId, uid, editor = null) {
  const trimmed = uid?.trim();
  if (!trimmed) throw new Error('請輸入 UID');
  await callUpsertTenantMember({ tenantId, uid: trimmed, role: 'admin' });
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
  reuseExisting = false,
}) {
  const id = String(tenantId || '').trim();
  if (!id) throw new Error('缺少 tenantId');
  await assertPlatformAdmin(editor);
  const { uid, email: trimmedEmail, password: pw } = await createAuthUserForEmail({
    email,
    password,
    reuseExisting,
    tenantId: id,
  });
  const now = Date.now();
  const profile = buildUserProfile({
    email: trimmedEmail,
    displayName,
    initialPassword: pw,
    editor,
    now,
  });
  await callUpsertTenantMember({
    tenantId: id,
    uid,
    role: 'admin',
    display_name: profile.display_name || '',
  });
  return { uid, email: trimmedEmail };
}

export async function getTenantUserProfiles(tenantId) {
  const id = String(tenantId || '').trim();
  if (!id) throw new Error('缺少 tenantId');
  const { getProfilesMap } = await import('@/lib/pb/members');
  return getProfilesMap(id);
}

export async function setTenantMemberProfile(tenantId, uid, patch, editor = null) {
  const id = String(tenantId || '').trim();
  const u = String(uid || '').trim();
  if (!id || !u) throw new Error('缺少 tenantId 或 uid');
  const { callUpdateMemberProfile } = await import('@/lib/twsApi');
  const current = (await getMemberProfile(id, u)) || {};
  await callUpdateMemberProfile({
    tenantId: id,
    uid: u,
    profile: {
      ...current,
      ...patch,
      ...(current.created_at ? {} : { created_at: Date.now() }),
      ...(current.created_by_uid ? {} : { created_by_uid: editor?.uid || '' }),
      ...(current.created_by_email ? {} : { created_by_email: editor?.email || '' }),
    },
  });
  if (editor?.uid) {
    await updateTenantMeta(id, {}, editor);
  }
}

export async function removeTenantMember(tenantId, uid) {
  const id = String(tenantId || '').trim();
  const u = String(uid || '').trim();
  if (!id || !u) throw new Error('缺少 tenantId 或 uid');
  return callRemoveTenantMember({ tenantId: id, uid: u });
}

export async function isSlugTaken(slug) {
  const hit = await findTenantBySlug(slug);
  return !!hit;
}

async function provisionTenantOwner({
  tenantId,
  uid,
  displayName = '',
}) {
  await callUpsertTenantMember({
    tenantId,
    uid,
    role: 'owner',
    display_name: String(displayName || '').trim(),
  });
}

function buildCreateTenantApiPayload({
  normalized,
  coupleNames,
  venueName,
  venueHall,
  weddingDate,
  themeColor,
  plan,
  ownerEmail,
  ownerPassword,
  ownerDisplayName,
  tenantData = {},
}) {
  const defaultTableSettings = buildDefaultTableSettings();
  const defaultFloorLayout = buildFloorPlanFromTableSettings(defaultTableSettings);
  return {
    slug: normalized,
    coupleNames: coupleNames.trim(),
    venueName: venueName.trim(),
    venueHall: venueHall.trim(),
    weddingDate,
    themeColor,
    plan,
    ownerEmail,
    ownerPassword,
    ownerDisplayName: String(ownerDisplayName || '').trim(),
    initial_password: ownerPassword,
    features: { ...DEFAULT_TENANT_FEATURES },
    wedding_guests: tenantData.wedding_guests ?? {},
    unassigned_guests: tenantData.unassigned_guests ?? [],
    guest_status: tenantData.guest_status ?? {},
    table_settings: tenantData.table_settings ?? defaultTableSettings,
    floor_layout: tenantData.floor_layout ?? defaultFloorLayout,
    meta_label_columns: tenantData.meta_label_columns ?? DEFAULT_LABEL_COLUMNS,
  };
}

async function createTenantViaClient({
  normalized,
  tenantId,
  trimmedEmail,
  pw,
  ownerDisplayName,
  meta,
  tenantData,
  ownerReuseExisting = false,
}) {
  let tenantWritten = false;
  try {
    const created = await createAuthUserForEmail({
      email: trimmedEmail,
      password: pw,
      displayName: ownerDisplayName,
      initialPassword: pw,
      reuseExisting: ownerReuseExisting,
    });
    const resolvedOwnerUid = created.uid;
    if (!resolvedOwnerUid) throw new Error('建立帳號失敗（缺少 uid）');

    const pb = getPocketBase();
    const tenantFields = metaToRecordFields(
      { ...meta, owner_uid: resolvedOwnerUid },
      normalized,
      tenantId,
    );
    await pb.collection('tenants').create(tenantFields);
    tenantWritten = true;

    const { updateTenantData } = await import('@/lib/pb/tenantData');
    await updateTenantData(tenantId, {
      wedding_guests: tenantData.wedding_guests ?? {},
      unassigned_guests: tenantData.unassigned_guests ?? [],
      guest_status: tenantData.guest_status ?? {},
      table_settings: tenantData.table_settings ?? buildDefaultTableSettings(),
      floor_layout: tenantData.floor_layout ?? buildFloorPlanFromTableSettings(buildDefaultTableSettings()),
      meta_label_columns: tenantData.meta_label_columns ?? DEFAULT_LABEL_COLUMNS,
    });

    await provisionTenantOwner({
      tenantId,
      uid: resolvedOwnerUid,
      displayName: ownerDisplayName,
    });

    return {
      tenantId,
      slug: normalized,
      checkInUrl: `/p/${normalized}`,
      adminUrl: `/p/${normalized}/admin`,
      ownerUid: resolvedOwnerUid,
      ownerEmail: trimmedEmail,
      ownerReused: created.reused === true,
    };
  } catch (err) {
    if (tenantWritten) {
      try {
        await deleteTenant(normalized, tenantId);
      } catch {
        /* rollback best-effort */
      }
    }
    throw err;
  }
}

/**
 * 建立新 tenant（Super Admin 用；會透過 PocketBase API 建立 Owner 帳號）
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
  ownerReuseExisting = false,
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
  if (!ownerReuseExisting) assertPassword(pw);
  else if (pw) assertPassword(pw);
  await assertPlatformAdmin(editor);

  const apiPayload = buildCreateTenantApiPayload({
    normalized,
    coupleNames,
    venueName,
    venueHall,
    weddingDate,
    themeColor,
    plan,
    ownerEmail: trimmedEmail,
    ownerPassword: pw,
    ownerDisplayName,
  });

  try {
    const data = await callCreateTenant(apiPayload);
    return {
      tenantId: data.tenantId || normalized,
      slug: data.slug || normalized,
      checkInUrl: data.checkInUrl || `/p/${normalized}`,
      adminUrl: data.adminUrl || `/p/${normalized}/admin`,
      ownerUid: data.ownerUid,
      ownerEmail: data.ownerEmail || trimmedEmail,
      ownerReused: data.reused === true,
    };
  } catch (err) {
    if (!isTwsHooksMissingError(err)) throw err;
  }

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
    ...auditFields(editor, { isCreate: true }),
  };

  return createTenantViaClient({
    normalized,
    tenantId,
    trimmedEmail,
    pw,
    ownerDisplayName,
    meta,
    ownerReuseExisting,
    tenantData: {
      wedding_guests: {},
      unassigned_guests: [],
      guest_status: {},
      table_settings: apiPayload.table_settings,
      floor_layout: apiPayload.floor_layout,
      meta_label_columns: apiPayload.meta_label_columns,
    },
  });
}

export async function setAuthUserPassword({ uid, newPassword }) {
  const pw = String(newPassword || '').trim();
  if (pw.length < 6) throw new Error('密碼至少需要 6 個字元');
  return callSetUserPassword({ uid, newPassword: pw });
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
  ownerReuseExisting = false,
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
  if (!ownerReuseExisting) assertPassword(pw);
  else if (pw) assertPassword(pw);
  await assertPlatformAdmin(editor);

  const apiPayload = buildCreateTenantApiPayload({
    normalized,
    coupleNames,
    venueName,
    venueHall,
    weddingDate,
    themeColor,
    plan,
    ownerEmail: trimmedEmail,
    ownerPassword: pw,
    ownerDisplayName,
    tenantData: sourceData,
  });

  try {
    const data = await callCreateTenant(apiPayload);
    return {
      tenantId: data.tenantId || normalized,
      slug: data.slug || normalized,
      checkInUrl: data.checkInUrl || `/p/${normalized}`,
      adminUrl: data.adminUrl || `/p/${normalized}/admin`,
      ownerUid: data.ownerUid,
      ownerEmail: data.ownerEmail || trimmedEmail,
      ownerReused: data.reused === true,
    };
  } catch (err) {
    if (!isTwsHooksMissingError(err)) throw err;
  }

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
    ...auditFields(editor, { isCreate: true }),
  };

  return createTenantViaClient({
    normalized,
    tenantId,
    trimmedEmail,
    pw,
    ownerDisplayName,
    meta,
    ownerReuseExisting,
    tenantData: sourceData,
  });
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

/** 永久刪除 tenant（含成員、資料、及無其他專案嘅 orphan 帳號） */
export async function deleteTenant(slug, tenantId) {
  const trimmedSlug = String(slug || '').trim();
  const id = String(tenantId || '').trim();
  if (!trimmedSlug || !id) throw new Error('缺少 slug 或 tenantId');
  await deleteTenantRecord(id);
}
