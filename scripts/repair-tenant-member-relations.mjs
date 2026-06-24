/**
 * 補齊 tenant_members.user / tenant relation（舊記錄可能只有 tenant_id、user_id 文字欄）
 * 用法：node scripts/repair-tenant-member-relations.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvLocal() {
  const path = resolve(root, '.env.local');
  if (!existsSync(path)) return;
  readFileSync(path, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) return;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
}

loadEnvLocal();

const baseUrl = (process.env.POCKETBASE_URL || process.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '');
const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL || '';
const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD || '';

if (!baseUrl || !adminEmail || !adminPassword) {
  console.error('請設定 POCKETBASE_URL、POCKETBASE_ADMIN_EMAIL、POCKETBASE_ADMIN_PASSWORD');
  process.exit(1);
}

async function adminAuth() {
  const res = await fetch(`${baseUrl}/api/admins/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Admin 登入失敗');
  return data.token;
}

async function api(token, path, options = {}) {
  const res = await fetch(`${baseUrl}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
      ...(options.headers || {}),
    },
  });
  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { message: raw };
  }
  if (!res.ok) {
    throw new Error(data?.message || `API ${path} 失敗 (${res.status})`);
  }
  return data;
}

async function main() {
  const token = await adminAuth();
  const tenantsRes = await api(token, '/collections/tenants/records?perPage=500');
  const tenantByKey = new Map();
  for (const t of tenantsRes.items || []) {
    if (t.tenant_id) tenantByKey.set(t.tenant_id, t.id);
    if (t.slug) tenantByKey.set(t.slug, t.id);
  }

  const membersRes = await api(token, '/collections/tenant_members/records?perPage=500');
  let repaired = 0;
  let skipped = 0;

  for (const row of membersRes.items || []) {
    const tenantKey = row.tenant_id;
    const uid = row.user_id;
    const tenantRecId = tenantByKey.get(tenantKey);
    const needsUser = !row.user && uid;
    const needsTenant = !row.tenant && tenantRecId;
    if (!needsUser && !needsTenant) {
      skipped += 1;
      continue;
    }
    const patch = {};
    if (needsUser) patch.user = uid;
    if (needsTenant) patch.tenant = tenantRecId;
    if (!tenantRecId && needsTenant) {
      console.warn(`! ${row.id}: 找不到 tenant ${tenantKey}，略過 tenant relation`);
    }
    await api(token, `/collections/tenant_members/records/${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    console.log(`↑ ${tenantKey} / ${uid}: 補齊 relation`);
    repaired += 1;
  }

  console.log(`\n完成：修復 ${repaired}、已齊 ${skipped}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
