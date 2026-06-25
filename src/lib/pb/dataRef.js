/**
 * PocketBase tenant_data 寫入用 DbRef（畫布等深層 path 更新）。
 * 底層仍用 pocketbaseRtdb 的 path→collection 映射，但 SPA 不再 import @/rtdb。
 */
import { database } from '@/lib/pocketbaseRtdb';

export function tenantDataDbRef(tenantId, subPath = '') {
  const id = String(tenantId || '').trim();
  if (!id) throw new Error('專案未就緒');
  const base = `tenants/${id}`;
  const path = subPath ? `${base}/${subPath}` : base;
  return database.ref(path);
}

/** @deprecated 舊名稱；請用 tenantDataDbRef */
export function tenantRef(tenantId, subPath = '') {
  return tenantDataDbRef(tenantId, subPath);
}
