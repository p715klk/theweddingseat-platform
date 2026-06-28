import { callListAuditLogs, callWriteAuditLog } from '@/lib/twsApi';

export const AUDIT_PAGE_SIZE_OPTIONS = [10, 30, 50, 100];

export function formatAuditTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('zh-HK');
}

/** 寫入操作記錄（失敗時靜默，唔阻礙主流程） */
export async function writeAuditLog({ tenantId, page, action, detail = '' }) {
  const tid = String(tenantId || '').trim();
  const pageName = String(page || '').trim();
  const actionName = String(action || '').trim();
  if (!tid || !pageName || !actionName) return;
  try {
    await callWriteAuditLog({ tenantId: tid, page: pageName, action: actionName, detail });
  } catch (e) {
    console.warn('audit log failed:', e?.message || e);
  }
}

export async function fetchAuditLogs({ tenantId, page = 1, perPage = 30 }) {
  const tid = String(tenantId || '').trim();
  if (!tid) throw new Error('專案未就緒');
  const size = AUDIT_PAGE_SIZE_OPTIONS.includes(perPage) ? perPage : 30;
  return callListAuditLogs({ tenantId: tid, page, perPage: size });
}
