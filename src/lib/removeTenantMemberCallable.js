import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebaseFunctions';

function mapCallableError(err) {
  const code = String(err?.code || '');
  const message = String(err?.message || '移除用戶失敗');
  if (code.includes('unauthenticated')) return '需要登入';
  if (code.includes('permission-denied')) return '沒有權限移除此用戶';
  if (code.includes('not-found')) return '此用戶不在專案成員清單內';
  if (code.includes('failed-precondition')) return message;
  if (code.includes('invalid-argument')) return message;
  return message;
}

/**
 * 移除專案成員（RTDB + 若無其他 membership 則刪除 Auth）
 * 需 Owner 或 Super Admin 權限（由 Cloud Function 驗證）
 */
export async function callRemoveTenantMember({ tenantId, uid }) {
  const fn = httpsCallable(functions, 'removeTenantMember');
  try {
    const result = await fn({ tenantId, uid });
    return result.data;
  } catch (err) {
    throw new Error(mapCallableError(err));
  }
}
