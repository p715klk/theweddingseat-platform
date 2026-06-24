/**
 * 清空 PocketBase 用戶相關資料（需 Admin 帳號，唔會刪 PocketBase Admin 本身）
 *
 * 用法：
 *   npm run cleanup:pocketbase-users
 *   npm run cleanup:pocketbase-users -- --keep-email=you@example.com
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnvLocal() {
  const path = resolve(root, '.env.local');
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  text.split('\n').forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) return;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
}

loadEnvLocal();

const baseUrl = (process.env.POCKETBASE_URL || process.env.VITE_POCKETBASE_URL || '').replace(/\/$/, '');
const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL || '';
const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD || '';
const keepEmail = (process.argv.find((a) => a.startsWith('--keep-email=')) || '')
  .split('=')[1]
  ?.trim()
  .toLowerCase() || '';

if (!baseUrl || !adminEmail || !adminPassword) {
  console.error('請設定 POCKETBASE_URL、POCKETBASE_ADMIN_EMAIL、POCKETBASE_ADMIN_PASSWORD（.env.local）');
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

async function request(token, path, options = {}) {
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
  return { ok: res.ok, status: res.status, data, path };
}

async function deleteAllRecords(token, collection) {
  let page = 1;
  let total = 0;
  const failures = [];
  for (;;) {
    const list = await request(token, `/collections/${collection}/records?perPage=100&page=${page}`);
    if (!list.ok) throw new Error(list.data?.message || `列出 ${collection} 失敗`);
    const items = list.data.items || [];
    if (!items.length) break;
    for (const row of items) {
      const del = await request(token, `/collections/${collection}/records/${row.id}`, { method: 'DELETE' });
      if (del.ok) {
        total += 1;
        process.stdout.write(`\r  刪除 ${collection}: ${total}`);
      } else {
        failures.push({ id: row.id, message: del.data?.message || del.data?.data || `HTTP ${del.status}` });
      }
    }
    if (items.length < 100) break;
    page += 1;
  }
  if (total) console.log('');
  if (failures.length) {
    console.warn(`  ! ${collection} 有 ${failures.length} 筆刪除失敗（已略過）`);
    failures.slice(0, 3).forEach((f) => console.warn(`    - ${f.id}: ${JSON.stringify(f.message)}`));
  }
  return { total, failures };
}

async function main() {
  console.log(`連線至 ${baseUrl} ...`);
  const token = await adminAuth();

  console.log('1/4 刪除 tenant_members ...');
  await deleteAllRecords(token, 'tenant_members');

  console.log('2/4 刪除 tenant_data ...');
  await deleteAllRecords(token, 'tenant_data');

  console.log('3/4 刪除 tenants ...');
  await deleteAllRecords(token, 'tenants');

  console.log('4/4 再清 tenant_members（保險）...');
  await deleteAllRecords(token, 'tenant_members');

  console.log('5/5 刪除 users（Auth）...');
  let page = 1;
  let deleted = 0;
  let kept = 0;
  const userFailures = [];
  for (;;) {
    const list = await request(token, `/collections/users/records?perPage=100&page=${page}`);
    if (!list.ok) throw new Error(list.data?.message || '列出 users 失敗');
    const items = list.data.items || [];
    if (!items.length) break;
    for (const user of items) {
      const email = String(user.email || '').toLowerCase();
      if (keepEmail && email === keepEmail) {
        kept += 1;
        continue;
      }
      const del = await request(token, `/collections/users/records/${user.id}`, { method: 'DELETE' });
      if (del.ok) {
        deleted += 1;
        process.stdout.write(`\r  刪除 users: ${deleted}（保留 ${kept}，失敗 ${userFailures.length}）`);
      } else {
        const detail = del.data?.data?.details || del.data?.message || del.data;
        userFailures.push({ id: user.id, email, detail });
      }
    }
    if (items.length < 100) break;
    page += 1;
  }
  console.log('');

  console.log('\n完成！');
  console.log(`- users 已刪：${deleted}；保留：${kept}`);
  if (userFailures.length) {
    console.log(`- users 刪除失敗：${userFailures.length} 筆`);
    userFailures.forEach((f) => {
      console.log(`  · ${f.email || f.id}: ${typeof f.detail === 'string' ? f.detail : JSON.stringify(f.detail)}`);
    });
    console.log('\n請先更新 NAS pb_hooks（version 8：GET /tws/health）再重試 cleanup');
    process.exit(1);
  }
  if (keepEmail) console.log(`- 已保留：${keepEmail}`);
  console.log('- PocketBase Admin 帳號不受影響');
  console.log('- 請喺 users 確認 is_platform_admin 後再登入 /super');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
