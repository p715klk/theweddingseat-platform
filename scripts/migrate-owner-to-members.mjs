/**
 * 將 tenants.owner_uid 遷移到 tenant_members.role = owner
 * 用法：node scripts/migrate-owner-to-members.mjs
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
  const tenants = await api(token, '/collections/tenants/records?perPage=200');
  let migrated = 0;
  let updated = 0;

  for (const tenant of tenants.items || []) {
    const tenantId = tenant.tenant_id || tenant.slug;
    const ownerUid = tenant.owner_uid;
    if (!tenantId || !ownerUid) continue;

    const filter = `tenant_id = ${JSON.stringify(tenantId)} && user_id = ${JSON.stringify(ownerUid)}`;
    const existing = await api(
      token,
      `/collections/tenant_members/records?filter=${encodeURIComponent(filter)}&perPage=1`,
    );
    const row = existing.items?.[0];
    const patch = {
      tenant_id: tenantId,
      user_id: ownerUid,
      role: 'owner',
      user: ownerUid,
      tenant: tenant.id,
    };

    if (row) {
      if (row.role !== 'owner') {
        await api(token, `/collections/tenant_members/records/${row.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ role: 'owner', ...patch }),
        });
        console.log(`↑ ${tenantId}: ${ownerUid} admin→owner`);
        updated += 1;
      } else {
        console.log(`✓ ${tenantId}: owner 已存在`);
      }
      continue;
    }

    await api(token, '/collections/tenant_members/records', {
      method: 'POST',
      body: JSON.stringify({ ...patch, created_at: Date.now() }),
    });
    console.log(`+ ${tenantId}: 新增 owner member ${ownerUid}`);
    migrated += 1;
  }

  console.log(`\n完成：新增 ${migrated}、更新 ${updated}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
