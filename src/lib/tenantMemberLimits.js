/** 每個 project 帳戶配額：1 Owner + 3 Project admin + 6 reception = 10 */
export const MEMBER_LIMITS = {
  owner: 1,
  admin: 3,
  reception: 6,
  total: 10,
};

export function countMemberSlots(members, ownerUid = '') {
  let owner = 0;
  let admin = 0;
  let reception = 0;

  (members || []).forEach((m) => {
    if (m.role === 'owner') owner += 1;
    else if (m.role === 'admin') admin += 1;
    else if (m.role === 'reception') reception += 1;
  });

  // 舊資料可能只得 meta.owner_uid、tenant_members 未寫 owner role
  if (owner === 0 && ownerUid) owner = 1;

  return {
    owner,
    admin,
    reception,
    total: owner + admin + reception,
  };
}

export function projectMemberRoleCounts(members, uid, newRole) {
  const projected = { owner: 0, admin: 0, reception: 0 };
  (members || []).forEach((m) => {
    const role = m.uid === uid ? newRole : m.role;
    if (role === 'owner') projected.owner += 1;
    else if (role === 'admin') projected.admin += 1;
    else if (role === 'reception') projected.reception += 1;
  });
  projected.total = projected.owner + projected.admin + projected.reception;
  return projected;
}

export function getMemberQuota(members, ownerUid = '') {
  const counts = countMemberSlots(members, ownerUid);
  return {
    counts,
    limits: { ...MEMBER_LIMITS },
    remaining: {
      owner: Math.max(0, MEMBER_LIMITS.owner - counts.owner),
      admin: Math.max(0, MEMBER_LIMITS.admin - counts.admin),
      reception: Math.max(0, MEMBER_LIMITS.reception - counts.reception),
      total: Math.max(0, MEMBER_LIMITS.total - counts.total),
    },
  };
}

export function canAddMemberRole(members, ownerUid, role, { bypassLimits = false } = {}) {
  if (bypassLimits) return true;
  const { remaining } = getMemberQuota(members, ownerUid);
  if (remaining.total <= 0) return false;
  if (role === 'admin') return remaining.admin > 0;
  if (role === 'reception') return remaining.reception > 0;
  return false;
}

export function hasAddableMemberRole(members, ownerUid, { bypassLimits = false } = {}) {
  return (
    canAddMemberRole(members, ownerUid, 'admin', { bypassLimits })
    || canAddMemberRole(members, ownerUid, 'reception', { bypassLimits })
  );
}

export function canChangeMemberToRole(members, uid, role, { bypassLimits = false } = {}) {
  if (bypassLimits) return true;
  const target = (members || []).find((m) => m.uid === uid);
  if (!target || target.role === 'owner' || target.role === role) return false;
  const projected = projectMemberRoleCounts(members, uid, role);
  if (projected.admin > MEMBER_LIMITS.admin) return false;
  if (projected.reception > MEMBER_LIMITS.reception) return false;
  return true;
}

export function hasRoleChangeOptions(members, uid, { bypassLimits = false } = {}) {
  const target = (members || []).find((m) => m.uid === uid);
  if (!target || target.role === 'owner') return false;
  return (
    canChangeMemberToRole(members, uid, 'admin', { bypassLimits })
    || canChangeMemberToRole(members, uid, 'reception', { bypassLimits })
  );
}

export function getSwapRoleCandidates(members, uid) {
  const target = (members || []).find((m) => m.uid === uid);
  if (!target || target.role === 'owner') return [];
  const opposite = target.role === 'admin' ? 'reception' : target.role === 'reception' ? 'admin' : '';
  if (!opposite) return [];
  return (members || []).filter((m) => m.uid !== uid && m.role === opposite);
}

export function assertCanAddMember(members, ownerUid, role, { bypassLimits = false } = {}) {
  if (bypassLimits) return;
  const { remaining } = getMemberQuota(members, ownerUid);

  if (remaining.total <= 0) {
    throw new Error(`已達專案帳戶上限（最多 ${MEMBER_LIMITS.total} 個）`);
  }
  if (role === 'admin' && remaining.admin <= 0) {
    throw new Error(`後台管理員已滿（最多 ${MEMBER_LIMITS.admin} 個）`);
  }
  if (role === 'reception' && remaining.reception <= 0) {
    throw new Error(`現場接待已滿（最多 ${MEMBER_LIMITS.reception} 個）`);
  }
}

export function assertCanChangeMemberRole(members, ownerUid, uid, role, { bypassLimits = false } = {}) {
  if (bypassLimits) return;
  const target = (members || []).find((m) => m.uid === uid);
  if (!target) throw new Error('找不到用戶');
  if (target.role === 'owner') throw new Error('不能變更 Owner 角色');
  if (target.role === role) return;

  const projected = projectMemberRoleCounts(members, uid, role);
  if (projected.admin > MEMBER_LIMITS.admin) {
    throw new Error(`後台管理員已滿（最多 ${MEMBER_LIMITS.admin} 個）`);
  }
  if (projected.reception > MEMBER_LIMITS.reception) {
    throw new Error(`現場接待已滿（最多 ${MEMBER_LIMITS.reception} 個）`);
  }
}
