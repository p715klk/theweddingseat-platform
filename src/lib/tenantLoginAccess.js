import { getMemberRole } from '@/lib/pb/members';

/**
 * @param {'checkin' | 'admin'} scope
 * @returns {Promise<{ ok: boolean, code?: string, role?: string }>}
 */
export async function validateTenantMemberLogin(
  tenantId,
  uid,
  ownerUid,
  isPlatformAdmin,
  scope = 'checkin',
) {
  if (isPlatformAdmin) return { ok: true, role: 'platform_admin' };
  const tid = String(tenantId || '').trim();
  const id = String(uid || '').trim();
  if (!tid || !id) return { ok: false, code: 'missing_context' };

  const role = await getMemberRole(tid, id, ownerUid);
  if (!role) return { ok: false, code: 'not_member' };

  if (scope === 'admin') {
    if (role === 'owner' || role === 'admin') return { ok: true, role };
    if (role === 'reception') return { ok: false, code: 'reception_only' };
    return { ok: false, code: 'not_member' };
  }

  return { ok: true, role };
}

export function tenantLoginRejectionMessage(code) {
  switch (code) {
    case 'not_member':
      return '此帳號未獲授權登入此宴會專案，請聯絡 Owner。';
    case 'reception_only':
      return '現場接待帳號只可登入點名頁，請使用「前往點名首頁」。';
    default:
      return '登入失敗，請確認帳號權限。';
  }
}
