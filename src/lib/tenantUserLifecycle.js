import getPocketBase from '@/lib/pocketbaseClient';

/** RTDB user_profiles 形狀（資料來源：users collection） */
export function userRecordToProfile(u) {
  if (!u) {
    return {
      email: '',
      display_name: '',
      created_at: null,
      created_by_uid: '',
      created_by_email: '',
    };
  }
  return {
    email: u.email || '',
    display_name: u.display_name || '',
    ...(u.initial_password ? { initial_password: u.initial_password } : {}),
    created_at: u.created_at ?? null,
    created_by_uid: u.created_by_uid || '',
    created_by_email: u.created_by_email || '',
  };
}

export async function getUserProfilesByIds(uids) {
  const ids = [...new Set((uids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return {};

  const pb = getPocketBase();
  const filter = ids.map((id) => `id = ${JSON.stringify(id)}`).join(' || ');
  const list = await pb.collection('users').getList(1, Math.min(ids.length, 200), { filter });
  const map = {};
  list.items.forEach((u) => {
    map[u.id] = userRecordToProfile(u);
  });
  return map;
}

export async function updateUserProfile(uid, profile) {
  const id = String(uid || '').trim();
  if (!id) throw new Error('missing uid');
  const value = profile || {};
  const patch = {
    display_name: value.display_name ?? '',
    initial_password: value.initial_password ?? '',
  };
  if (value.created_at != null) patch.created_at = value.created_at;
  if (value.created_by_uid != null) patch.created_by_uid = value.created_by_uid;
  if (value.created_by_email != null) patch.created_by_email = value.created_by_email;
  await getPocketBase().collection('users').update(id, patch);
}

/** 無任何 project membership、唔係 owner、唔係 platform admin */
export async function isOrphanProjectUser(uid) {
  const id = String(uid || '').trim();
  if (!id) return false;

  const pb = getPocketBase();
  try {
    const user = await pb.collection('users').getOne(id);
    if (user.is_platform_admin === true) return false;
  } catch {
    return false;
  }

  const members = await pb.collection('tenant_members').getList(1, 1, {
    filter: `user_id = ${JSON.stringify(id)}`,
  });
  return members.totalItems === 0;
}

export async function findAuthUserByEmail(email) {
  const trimmedEmail = String(email || '').trim().toLowerCase();
  if (!trimmedEmail) return null;

  const pb = getPocketBase();
  const list = await pb.collection('users').getList(1, 1, {
    filter: `email = ${JSON.stringify(trimmedEmail)}`,
  });
  return list.items[0] || null;
}

export async function cleanupOrphanedAuthUsers(userIds) {
  const unique = [...new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  for (const uid of unique) {
    if (!(await isOrphanProjectUser(uid))) continue;
    await getPocketBase().collection('users').delete(uid);
  }
}
