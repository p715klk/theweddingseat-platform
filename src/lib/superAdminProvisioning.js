import { ref as dbRef, get } from '@/rtdb';
import { database } from '@/firebase';
import { createAuthUserViaRest } from '@/lib/firebaseAuthRest';
import getPocketBase, { isPocketBaseConfigured } from '@/lib/pocketbaseClient';

export function normalizeEmail(input) {
  return String(input || '').trim().toLowerCase();
}

export function normalizePassword(input) {
  return String(input || '').trim();
}

export function assertPassword(pw) {
  if (!pw || pw.length < 6) throw new Error('初始密碼至少需要 6 個字元');
}

export async function assertPlatformAdmin(editor) {
  if (!editor?.uid) throw new Error('未登入（缺少 editor uid）');
  if (isPocketBaseConfigured()) {
    const pb = getPocketBase();
    const auth = pb.authStore.record;
    if (!auth || auth.id !== editor.uid) {
      throw new Error('未登入或身分不符');
    }
    if (auth.is_platform_admin !== true) {
      throw new Error('此帳號未設為 platform admin，無權進行此操作');
    }
    return;
  }
  const snap = await get(dbRef(database, `platform_admins/${editor.uid}`));
  if (snap.val() !== true) {
    throw new Error('此帳號未列入 platform_admins，無權進行此操作');
  }
}

export async function createAuthUserForEmail({
  email,
  password,
  displayName = '',
  initialPassword = '',
}) {
  const trimmedEmail = normalizeEmail(email);
  if (!trimmedEmail) throw new Error('請輸入 Email');
  const pw = normalizePassword(password);
  assertPassword(pw);
  const created = await createAuthUserViaRest(trimmedEmail, pw, {
    display_name: displayName,
    initial_password: initialPassword || pw,
  });
  if (!created?.uid) throw new Error('建立帳號失敗（缺少 uid）');
  return { uid: created.uid, email: trimmedEmail, password: pw };
}

export function buildUserProfile({ email, displayName = '', initialPassword = '', editor = null, now = Date.now() }) {
  return {
    email,
    display_name: String(displayName || '').trim(),
    initial_password: String(initialPassword || '').trim(),
    created_at: now,
    created_by_uid: editor?.uid || '',
    created_by_email: editor?.email || '',
  };
}

export function buildMemberProvisionUpdates({
  tenantId,
  uid,
  profile,
  editor = null,
  now = Date.now(),
  includeOwner = false,
  includeMetaPaths = true,
}) {
  const id = String(tenantId || '').trim();
  const u = String(uid || '').trim();
  if (!id || !u) throw new Error('缺少 tenantId 或 uid');

  return {
    ...(includeMetaPaths && includeOwner ? { [`tenants/${id}/meta/owner_uid`]: u } : {}),
    [`tenants/${id}/members/${u}`]: includeOwner ? 'owner' : true,
    [`tenants/${id}/user_profiles/${u}`]: profile,
    ...(includeMetaPaths && editor?.uid
      ? {
          [`tenants/${id}/meta/updated_at`]: now,
          [`tenants/${id}/meta/updated_by_uid`]: editor.uid,
          [`tenants/${id}/meta/updated_by_email`]: editor.email || '',
        }
      : {}),
  };
}

