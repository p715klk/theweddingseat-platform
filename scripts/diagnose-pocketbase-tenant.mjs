/**
 * 診斷 project Owner 設定（用 Admin API）
 * 用法：node scripts/diagnose-pocketbase-tenant.mjs [tenant_slug_or_id]
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

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
const tenantKey = process.argv[2] || '';

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

async function main() {
  const token = await adminAuth();
  const headers = { Authorization: token };

  const health = await fetch(`${baseUrl}/tws/health`).then((r) => r.json()).catch(() => ({}));
  console.log('Hooks health:', health);

  if (!tenantKey) {
    const list = await fetch(`${baseUrl}/api/collections/tenants/records?perPage=50`, { headers })
      .then((r) => r.json());
    console.log('\n所有 tenants:');
    for (const t of list.items || []) {
      console.log(`- tenant_id=${t.tenant_id} slug=${t.slug} owner_uid=${t.owner_uid || '(空)'}`);
    }
    console.log('\n提示：node scripts/diagnose-pocketbase-tenant.mjs <slug>');
    return;
  }

  const filter = `tenant_id = ${JSON.stringify(tenantKey)} || slug = ${JSON.stringify(tenantKey)}`;
  const tenants = await fetch(
    `${baseUrl}/api/collections/tenants/records?filter=${encodeURIComponent(filter)}&perPage=1`,
    { headers },
  ).then((r) => r.json());

  const tenant = tenants.items?.[0];
  if (!tenant) {
    console.error('找不到 tenant:', tenantKey);
    process.exit(1);
  }

  console.log('\nTenant:');
  console.log(JSON.stringify({
    id: tenant.id,
    tenant_id: tenant.tenant_id,
    slug: tenant.slug,
    owner_uid: tenant.owner_uid || '(空 — 呢個就係 Owner 建唔到人嘅主因)',
    couple_names: tenant.couple_names,
  }, null, 2));

  if (tenant.owner_uid) {
    const user = await fetch(`${baseUrl}/api/collections/users/records/${tenant.owner_uid}`, { headers })
      .then((r) => r.json()).catch(() => null);
    if (user?.email) {
      console.log('\nOwner 帳號:', user.email, `(${user.id})`);
    } else {
      console.log('\n! owner_uid 指向嘅 users 記錄唔存在');
    }
  }

  const members = await fetch(
    `${baseUrl}/api/collections/tenant_members/records?filter=${encodeURIComponent(`tenant_id = ${JSON.stringify(tenant.tenant_id)}`)}&perPage=50`,
    { headers },
  ).then((r) => r.json());

  console.log('\nMembers:');
  for (const m of members.items || []) {
    console.log(`- user_id=${m.user_id} role=${m.role}`);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
