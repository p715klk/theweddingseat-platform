import getPocketBase from '@/lib/pocketbaseClient';
import {
  assertPlatformAdmin,
  buildUserProfile,
  createAuthUserForEmail,
} from '@/lib/superAdminProvisioning';

export async function listPlatformAdmins() {
  const pb = getPocketBase();
  const list = await pb.collection('users').getFullList({
    filter: 'is_platform_admin = true',
  });
  return list
    .map((u) => ({
      uid: u.id,
      email: u.email || '',
      displayName: u.display_name || '',
      initialPassword: u.initial_password || '',
      createdAt: u.created_at || null,
      createdByEmail: u.created_by_email || '',
    }))
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

  const pb = getPocketBase();
  const existing = await pb.collection('users').getOne(uid);
  if (existing?.is_platform_admin === true) {
    throw new Error('此帳號已是 Super Admin');
  }

  const profile = buildUserProfile({
    email: trimmedEmail,
    displayName,
    initialPassword: pw,
    editor,
    now: Date.now(),
  });

  await pb.collection('users').update(uid, {
    ...profile,
    is_platform_admin: true,
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

  const pb = getPocketBase();
  const list = await pb.collection('users').getFullList({
    filter: 'is_platform_admin = true',
  });
  if (list.length <= 1) {
    throw new Error('至少需要保留一位 Super Admin');
  }

  await pb.collection('users').update(targetUid, {
    is_platform_admin: false,
    display_name: '',
    initial_password: '',
  });
}
