/** 每個 project 帳戶配額：1 Owner + 3 Project admin + 6 reception = 10 */
export const MEMBER_LIMITS = {
  owner: 1,
  admin: 3,
  reception: 6,
  total: 10,
};

export function countMemberSlots(members, ownerUid = '') {
  const owner = ownerUid ? 1 : 0;
  let admin = 0;
  let reception = 0;

  (members || []).forEach((m) => {
    if (m.uid === ownerUid) return;
    if (m.role === 'admin') admin += 1;
    else if (m.role === 'reception') reception += 1;
  });

  return {
    owner,
    admin,
    reception,
    total: owner + admin + reception,
  };
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

  let admin = 0;
  let reception = 0;
  (members || []).forEach((m) => {
    if (m.uid === ownerUid || m.uid === uid) return;
    if (m.role === 'admin') admin += 1;
    else if (m.role === 'reception') reception += 1;
  });

  if (role === 'admin' && admin >= MEMBER_LIMITS.admin) {
    throw new Error(`後台管理員已滿（最多 ${MEMBER_LIMITS.admin} 個）`);
  }
  if (role === 'reception' && reception >= MEMBER_LIMITS.reception) {
    throw new Error(`現場接待已滿（最多 ${MEMBER_LIMITS.reception} 個）`);
  }
}
