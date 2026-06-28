/**
 * 將 tenants.tenant_id 同步為 slug（修復曾改名 slug 但 tenant_id 仍佔用舊名稱的問題）
 *
 * 需要 .env.local：
 *   VITE_POCKETBASE_URL 或 POCKETBASE_URL
 *   POCKETBASE_ADMIN_EMAIL
 *   POCKETBASE_ADMIN_PASSWORD
 *
 * 用法：node scripts/sync-tenant-id-to-slug.mjs
 *       node scripts/sync-tenant-id-to-slug.mjs --dry-run
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');

function loadEnvLocal() {
  const path = resolve(root, '.env.local');
  if (!existsSync(path)) return;
  readFileSync(path, 'utf8')
    .split('\n')
    .forEach((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || process.env[m[1]]) return;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
}

loadEnvLocal();

const pbUrl = (process.env.VITE_POCKETBASE_URL || process.env.POCKETBASE_URL || '').replace(/\/$/, '');
const pbAdminEmail = process.env.POCKETBASE_ADMIN_EMAIL || '';
const pbAdminPassword = process.env.POCKETBASE_ADMIN_PASSWORD || '';

async function pbAdminAuth() {
  const res = await fetch(`${pbUrl}/api/admins/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: pbAdminEmail, password: pbAdminPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'PocketBase admin 登入失敗');
  return data.token;
}

async function pbApi(token, path, options = {}) {
  const res = await fetch(`${pbUrl}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `API ${path} 失敗 (${res.status})`);
  return data;
}

async function listAll(token, collection, fields = '') {
  const items = [];
  let page = 1;
  const perPage = 200;
  for (;;) {
    const q = new URLSearchParams({ page: String(page), perPage: String(perPage) });
    if (fields) q.set('fields', fields);
    const data = await pbApi(token, `/collections/${collection}/records?${q}`);
    items.push(...(data.items || []));
    if (page >= (data.totalPages || 1)) break;
    page += 1;
  }
  return items;
}

async function main() {
  if (!pbUrl || !pbAdminEmail || !pbAdminPassword) {
    console.error('請在 .env.local 設定 VITE_POCKETBASE_URL、POCKETBASE_ADMIN_EMAIL、POCKETBASE_ADMIN_PASSWORD');
    process.exit(1);
  }

  const token = await pbAdminAuth();
  const tenants = await listAll(token, 'tenants', 'id,tenant_id,slug');
  const mismatched = tenants.filter((t) => t.slug && t.tenant_id && t.slug !== t.tenant_id);

  if (!mismatched.length) {
    console.log('✅ 所有 Project 的 tenant_id 已與 slug 一致。');
    return;
  }

  console.log(`${dryRun ? '[dry-run] ' : ''}發現 ${mismatched.length} 個不一致的 Project：`);
  mismatched.forEach((t) => {
    console.log(`  - slug=${t.slug}  tenant_id=${t.tenant_id}  (record ${t.id})`);
  });

  for (const tenant of mismatched) {
    const oldId = tenant.tenant_id;
    const newId = tenant.slug;
    if (!newId) {
      console.warn(`跳過 record ${tenant.id}：缺少 slug`);
      continue;
    }

    const conflict = tenants.find((t) => t.id !== tenant.id && (t.tenant_id === newId || t.slug === newId));
    if (conflict && conflict.id !== tenant.id) {
      console.error(`❌ 無法將 ${oldId} → ${newId}：已有其他記錄使用 ${newId}`);
      continue;
    }

    const [dataRows, memberRows] = await Promise.all([
      listAll(token, 'tenant_data', 'id,tenant_id'),
      listAll(token, 'tenant_members', 'id,tenant_id'),
    ]);

    const dataToUpdate = dataRows.filter((r) => r.tenant_id === oldId);
    const membersToUpdate = memberRows.filter((r) => r.tenant_id === oldId);

    console.log(`\n→ ${oldId} → ${newId}: tenant_data ${dataToUpdate.length} 筆, tenant_members ${membersToUpdate.length} 筆`);

    if (dryRun) continue;

    await pbApi(token, `/collections/tenants/records/${tenant.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ tenant_id: newId }),
    });

    for (const row of dataToUpdate) {
      await pbApi(token, `/collections/tenant_data/records/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ tenant_id: newId }),
      });
    }
    for (const row of membersToUpdate) {
      await pbApi(token, `/collections/tenant_members/records/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ tenant_id: newId }),
      });
    }

    console.log(`  ✅ 已更新`);
  }

  if (dryRun) {
    console.log('\n（dry-run 模式，未寫入資料庫）');
  } else {
    console.log('\n✅ 完成。舊 slug 名稱現可重新用於新 Project。');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
