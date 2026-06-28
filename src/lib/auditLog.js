import { callListAuditLogs, callWriteAuditLog } from '@/lib/twsApi';

export const AUDIT_PAGE_SIZE_OPTIONS = [10, 30, 50, 100];

/** 常用頁面名稱（操作記錄 tab 顯示） */
export const AUDIT_PAGES = {
  CHECKIN: '點名',
  GUESTLIST: '賓客名單',
  SEATING: '排位',
  SETTINGS: '設定',
  USERS: '用戶管理',
};

let auditContext = { tenantId: '', page: '' };
let lastLoginAuditKey = '';

export function setAuditPageContext({ tenantId, page }) {
  auditContext = {
    tenantId: String(tenantId || '').trim(),
    page: String(page || '').trim(),
  };
}

export function getAuditPageContext() {
  return { ...auditContext };
}

export function clearLoginAuditKey() {
  lastLoginAuditKey = '';
}

/** 登入成功後記一次（同一 tenant + user + page 唔重複） */
export function logLoginOnce({ tenantId, uid, page }) {
  const tid = String(tenantId || '').trim();
  const id = String(uid || '').trim();
  const pageName = String(page || auditContext.page || '').trim();
  if (!tid || !id || !pageName) return;
  const key = `${tid}:${id}:${pageName}`;
  if (lastLoginAuditKey === key) return;
  lastLoginAuditKey = key;
  void writeAuditLog({ tenantId: tid, page: pageName, action: '登入' });
}

/** 登出前記錄（用 setAuditPageContext 設定嘅 tenant / page） */
export function logLogout() {
  const { tenantId, page } = auditContext;
  if (!tenantId || !page) return;
  void writeAuditLog({ tenantId, page, action: '登出' });
  clearLoginAuditKey();
}

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
    await callWriteAuditLog({
      tenantId: tid,
      page: pageName,
      action: actionName,
      detail: String(detail || '').trim(),
    });
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
