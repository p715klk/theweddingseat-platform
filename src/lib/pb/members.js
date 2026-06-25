import getPocketBase from '@/lib/pocketbaseClient';
import { pbFilterString } from '@/lib/pb/filter';
import { callListTenantMembers } from '@/lib/twsApi';
import { getUserProfilesByIds } from '@/lib/tenantUserLifecycle';

export async function listTenantMembers(tenantId) {
  const pb = getPocketBase();
  return pb.collection('tenant_members').getFullList({
    filter: `tenant_id = ${pbFilterString(tenantId)}`,
  });
}

export async function resolveOwnerUid(tenantId, tenantRecord) {
  const rows = await listTenantMembers(tenantId);
  const ownerRow = rows.find((m) => m.role === 'owner');
  if (ownerRow?.user_id) return ownerRow.user_id;
  return tenantRecord?.owner_uid || '';
}

async function fetchMembersFromHook(tenantId) {
  const pb = getPocketBase();
  if (!pb.authStore.isValid) return null;
  try {
    const data = await callListTenantMembers({ tenantId });
    return data?.members?.length ? data : null;
  } catch {
    return null;
  }
}

export async function getMembersMap(tenantId) {
  const hookData = await fetchMembersFromHook(tenantId);
  if (hookData) {
    const map = {};
    hookData.members.forEach((m) => {
      if (!m.uid) return;
      if (m.role === 'owner') map[m.uid] = 'owner';
      else if (m.role === true) map[m.uid] = 'admin';
      else map[m.uid] = m.role || 'admin';
    });
    return map;
  }
  const rows = await listTenantMembers(tenantId);
  const map = {};
  rows.forEach((m) => {
    if (!m.user_id) return;
    if (m.role === 'owner') map[m.user_id] = 'owner';
    else if (m.role === true) map[m.user_id] = 'admin';
    else map[m.user_id] = m.role || 'admin';
  });
  return map;
}

export async function getMemberRole(tenantId, uid, ownerUid = '') {
  const map = await getMembersMap(tenantId);
  let role = map[uid] === true ? 'admin' : String(map[uid] || '');
  if (!role && ownerUid && ownerUid === uid) role = 'owner';
  return role;
}

export async function getProfilesMap(tenantId) {
  const hookData = await fetchMembersFromHook(tenantId);
  if (hookData) {
    const map = {};
    hookData.members.forEach((m) => {
      if (!m.uid) return;
      map[m.uid] = {
        email: m.email || '',
        display_name: m.display_name || '',
        created_at: m.created_at ?? null,
        created_by_uid: m.created_by_uid || '',
        created_by_email: m.created_by_email || '',
      };
    });
    return map;
  }
  const rows = await listTenantMembers(tenantId);
  const uids = rows.map((m) => m.user_id).filter(Boolean);
  const userMap = await getUserProfilesByIds(uids);
  const map = {};
  rows.forEach((m) => {
    const id = m.user_id;
    if (!id) return;
    const u = userMap[id] || {};
    map[id] = {
      email: u.email || '',
      display_name: m.display_name || u.display_name || '',
      created_at: m.created_at ?? u.created_at ?? null,
      created_by_uid: u.created_by_uid || '',
      created_by_email: u.created_by_email || '',
    };
  });
  return map;
}

export async function getMemberProfile(tenantId, uid) {
  const map = await getProfilesMap(tenantId);
  return map[uid] ?? null;
}

export async function ensureOwnerMemberRecord(tenantId, uid) {
  const role = await getMemberRole(tenantId, uid);
  if (role === 'owner' || role === 'admin') return;
  const { callUpsertTenantMember } = await import('@/lib/twsApi');
  await callUpsertTenantMember({ tenantId, uid, role: 'owner' });
}

export function subscribeTenantMembers(tenantId, callback) {
  const pb = getPocketBase();
  let unsub = () => {};
  pb.collection('tenant_members')
    .subscribe('*', (e) => {
      if (e.record?.tenant_id === tenantId) callback();
    })
    .then((fn) => {
      unsub = fn;
    })
    .catch(() => {});
  return () => {
    try {
      unsub();
    } catch {
      /* ignore */
    }
  };
}
