import { callListAllProjectMembers, callRemoveTenantMember, callSetUserPassword, callUpdateMemberProfile } from '@/lib/twsApi';

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

/**
 * 列出所有 project 成員（經 /tws/list-all-members；email 由 server 讀 users）
 */
export async function listAllProjectMembers() {
  const data = await callListAllProjectMembers();
  const rows = Array.isArray(data?.members) ? data.members : [];

  return rows
    .map((m) => {
      const tenantId = String(m.tenant_id || '').trim();
      const uid = String(m.uid || '').trim();
      const role = normalizeMemberRole(m.role);
      if (!tenantId || !uid || !role) return null;
      return {
        key: `${tenantId}:${uid}`,
        tenantId,
        slug: String(m.slug || tenantId).trim(),
        uid,
        role,
        roleLabel: MEMBER_ROLE_LABELS[role] || role,
        email: String(m.email || '').trim(),
        displayName: String(m.display_name || '').trim(),
        createdAt: m.created_at ?? null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const emailCmp = (a.email || a.uid).localeCompare(b.email || b.uid, 'zh-Hant');
      if (emailCmp !== 0) return emailCmp;
      const slugCmp = (a.slug || '').localeCompare(b.slug || '');
      if (slugCmp !== 0) return slugCmp;
      return (ROLE_SORT_ORDER[a.role] ?? 9) - (ROLE_SORT_ORDER[b.role] ?? 9);
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

export async function removeProjectMember(tenantId, uid) {
  return callRemoveTenantMember({ tenantId, uid });
}
