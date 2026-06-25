import getPocketBase from '@/lib/pocketbaseClient';
import { callRemoveTenantMember, callSetUserPassword, callUpdateMemberProfile } from '@/lib/twsApi';
import { getUserProfilesByIds } from '@/lib/tenantUserLifecycle';
const ROLE_SORT_ORDER = { owner: 0, admin: 1, reception: 2 };

export const MEMBER_ROLE_LABELS = {
  owner: 'Owner',
  admin: '後台管理員',
  reception: '現場接待',
};

function normalizeMemberRole(val) {
  if (val === 'owner') return 'owner';
  if (val === true || val === 'admin') return 'admin';
  if (val === 'reception') return 'reception';
  return '';
}

async function loadUserProfilesMap(userIds) {
  const ids = [...new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean))];
  const map = {};
  const chunkSize = 50;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const part = await getUserProfilesByIds(chunk);
    Object.assign(map, part);
  }
  return map;
}

/**
 * 列出所有 project 成員（tenant_members + users + tenants.slug）
 */
export async function listAllProjectMembers() {
  const pb = getPocketBase();
  const [memberRows, tenantRows] = await Promise.all([
    pb.collection('tenant_members').getFullList({ sort: 'tenant_id' }),
    pb.collection('tenants').getFullList({ fields: 'tenant_id,slug' }),
  ]);

  const slugByTenantId = {};
  tenantRows.forEach((t) => {
    const tid = String(t.tenant_id || '').trim();
    if (tid) slugByTenantId[tid] = t.slug || tid;
  });

  const validMembers = memberRows
    .map((m) => ({
      tenantId: String(m.tenant_id || '').trim(),
      uid: String(m.user_id || '').trim(),
      role: normalizeMemberRole(m.role),
    }))
    .filter((m) => m.tenantId && m.uid && m.role);

  const profiles = await loadUserProfilesMap(validMembers.map((m) => m.uid));

  return validMembers
    .map((m) => {
      const p = profiles[m.uid] || {};
      return {
        key: `${m.tenantId}:${m.uid}`,
        tenantId: m.tenantId,
        slug: slugByTenantId[m.tenantId] || m.tenantId,
        uid: m.uid,
        role: m.role,
        roleLabel: MEMBER_ROLE_LABELS[m.role] || m.role,
        email: p.email || '',
        displayName: p.display_name || '',
        createdAt: p.created_at || null,        createdByEmail: p.created_by_email || '',
      };
    })
    .sort((a, b) => {
      const slugCmp = (a.slug || '').localeCompare(b.slug || '');
      if (slugCmp !== 0) return slugCmp;
      const roleCmp = (ROLE_SORT_ORDER[a.role] ?? 9) - (ROLE_SORT_ORDER[b.role] ?? 9);
      if (roleCmp !== 0) return roleCmp;
      return (a.email || a.uid).localeCompare(b.email || b.uid, 'zh-Hant');
    });
}

export async function updateProjectMemberProfile(tenantId, uid, patch) {
  return callUpdateMemberProfile({
    tenantId,
    uid,
    profile: {
      display_name: patch.display_name ?? '',
    },
  });
}

export async function resetProjectMemberPassword(uid, newPassword) {
  return callSetUserPassword({ uid, newPassword });
}

export async function removeProjectMember(tenantId, uid) {  return callRemoveTenantMember({ tenantId, uid });
}
