import { ref as dbRef, get, update } from '@/rtdb';
import { database } from '@/firebase';
import {
  assertPlatformAdmin,
  buildUserProfile,
  createAuthUserForEmail,
} from '@/lib/superAdminProvisioning';

export async function listPlatformAdmins() {
  const [adminsSnap, profilesSnap] = await Promise.all([
    get(dbRef(database, 'platform_admins')),
    get(dbRef(database, 'platform_admin_profiles')),
  ]);
  const admins = adminsSnap.val() || {};
  const profiles = profilesSnap.val() || {};

  return Object.entries(admins)
    .filter(([, ok]) => ok === true)
    .map(([uid]) => {
      const p = profiles[uid] || {};
      return {
        uid,
        email: p.email || '',
        displayName: p.display_name || '',
        initialPassword: p.initial_password || '',
        createdAt: p.created_at || null,
        createdByEmail: p.created_by_email || '',
      };
    })
    .sort((a, b) => (a.email || a.uid).localeCompare(b.email || b.uid));
}

export async function createPlatformAdminUser({
  email,
  password,
  displayName = '',
  editor = null,
}) {
  await assertPlatformAdmin(editor);
  const { uid, email: trimmedEmail, password: pw } = await createAuthUserForEmail({ email, password });

  const existing = await get(dbRef(database, `platform_admins/${uid}`));
  if (existing.val() === true) {
    throw new Error('此帳號已是 Super Admin');
  }

  const now = Date.now();
  const profile = buildUserProfile({
    email: trimmedEmail,
    displayName,
    initialPassword: pw,
    editor,
    now,
  });

  await update(dbRef(database), {
    [`platform_admins/${uid}`]: true,
    [`platform_admin_profiles/${uid}`]: profile,
  });

  return { uid, email: trimmedEmail, password: pw };
}

export async function removePlatformAdmin({ uid, editor = null }) {
  await assertPlatformAdmin(editor);
  const targetUid = String(uid || '').trim();
  if (!targetUid) throw new Error('缺少 uid');
  if (editor?.uid === targetUid) {
    throw new Error('不能移除自己的 Super Admin 權限');
  }

  const adminsSnap = await get(dbRef(database, 'platform_admins'));
  const admins = adminsSnap.val() || {};
  const activeCount = Object.values(admins).filter((v) => v === true).length;
  if (activeCount <= 1) {
    throw new Error('至少需要保留一位 Super Admin');
  }

  await update(dbRef(database), {
    [`platform_admins/${targetUid}`]: null,
    [`platform_admin_profiles/${targetUid}`]: null,
  });
}
