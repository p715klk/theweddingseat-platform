/**
 * 初始化 PocketBase collections（需 Admin 帳號）
 *
 * 用法：
 *   POCKETBASE_URL=http://kin9310.myqnapcloud.com:8090 \
 *   POCKETBASE_ADMIN_EMAIL=admin@example.com \
 *   POCKETBASE_ADMIN_PASSWORD=yourpassword \
 *   node scripts/setup-pocketbase.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
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

if (!baseUrl || !adminEmail || !adminPassword) {
  console.error('請設定 POCKETBASE_URL、POCKETBASE_ADMIN_EMAIL、POCKETBASE_ADMIN_PASSWORD');
  process.exit(1);
}

function fieldId() {
  return randomBytes(8).toString('hex').slice(0, 15);
}

function defaultOptions(type, options = {}) {
  switch (type) {
    case 'text':
      return { min: null, max: null, pattern: '', ...options };
    case 'number':
      return { min: null, max: null, noDecimal: false, ...options };
    case 'bool':
      return {};
    case 'json':
      return { maxSize: 2000000, ...options };
    case 'select':
      return options;
    default:
      return options;
  }
}

function normalizeField({ name, type, required = false, options }) {
  return {
    id: fieldId(),
    name,
    type,
    system: false,
    required,
    presentable: false,
    unique: false,
    options: defaultOptions(type, options),
  };
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
    const detail = data?.data ? `\n${JSON.stringify(data.data, null, 2)}` : '';
    throw new Error(`${data?.message || `API ${path} 失敗 (${res.status})`}${detail}`);
  }
  return data;
}

async function listCollections(token) {
  const data = await api(token, '/collections?perPage=200');
  return data.items || [];
}

const userFieldDefs = [
  { name: 'is_platform_admin', type: 'bool', required: false },
  { name: 'display_name', type: 'text', required: false },
  { name: 'initial_password', type: 'text', required: false },
  { name: 'created_at', type: 'number', required: false },
  { name: 'created_by_uid', type: 'text', required: false },
  { name: 'created_by_email', type: 'text', required: false },
];

async function ensureUsersFields(token, existing) {
  const users = existing.find((c) => c.name === 'users');
  if (!users) {
    console.log('! 找不到 users auth collection');
    return;
  }

  const names = new Set(users.schema.map((f) => f.name));
  const missing = userFieldDefs.filter((f) => !names.has(f.name));
  if (!missing.length) {
    console.log('✓ users 自訂欄位已齊');
    return;
  }

  const schema = [
    ...users.schema,
    ...missing.map((f) => normalizeField(f)),
  ];

  console.log(`+ 更新 users 欄位: ${missing.map((f) => f.name).join(', ')}`);
  await api(token, `/collections/${users.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ schema }),
  });
}

const collectionDefs = [
  {
    name: 'tenants',
    type: 'base',
    listRule: '',
    viewRule: '',
    createRule: '@request.auth.is_platform_admin = true',
    updateRule: '@request.auth.is_platform_admin = true || owner_uid = @request.auth.id',
    deleteRule: '@request.auth.is_platform_admin = true',
    fields: [
      { name: 'tenant_id', type: 'text', required: true, options: { min: 2, max: 64 } },
      { name: 'slug', type: 'text', required: true, options: { min: 2, max: 64 } },
      { name: 'couple_names', type: 'text' },
      { name: 'venue_name', type: 'text' },
      { name: 'venue_hall', type: 'text' },
      { name: 'wedding_date', type: 'text' },
      { name: 'theme_color', type: 'text' },
      { name: 'status', type: 'text' },
      { name: 'plan', type: 'text' },
      { name: 'owner_uid', type: 'text' },
      { name: 'features', type: 'json' },
      { name: 'created_at', type: 'number' },
      { name: 'created_by_uid', type: 'text' },
      { name: 'created_by_email', type: 'text' },
      { name: 'updated_at', type: 'number' },
      { name: 'updated_by_uid', type: 'text' },
      { name: 'updated_by_email', type: 'text' },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_tenants_tenant_id ON tenants (tenant_id)',
      'CREATE UNIQUE INDEX idx_tenants_slug ON tenants (slug)',
    ],
  },
  {
    name: 'tenant_data',
    type: 'base',
    listRule: '',
    viewRule: '',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.is_platform_admin = true',
    fields: [
      { name: 'tenant_id', type: 'text', required: true, options: { min: 2, max: 64 } },
      { name: 'wedding_guests', type: 'json' },
      { name: 'unassigned_guests', type: 'json' },
      { name: 'guest_status', type: 'json' },
      { name: 'table_settings', type: 'json' },
      { name: 'floor_layout', type: 'json' },
      { name: 'meta_label_columns', type: 'json' },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_tenant_data_tid ON tenant_data (tenant_id)'],
  },
  {
    name: 'tenant_members',
    type: 'base',
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.id != ""',
    fields: [
      { name: 'tenant_id', type: 'text', required: true },
      { name: 'user_id', type: 'text', required: true },
      {
        name: 'role',
        type: 'select',
        required: true,
        options: { maxSelect: 1, values: ['admin', 'reception'] },
      },
      { name: 'email', type: 'text' },
      { name: 'display_name', type: 'text' },
      { name: 'initial_password', type: 'text' },
      { name: 'created_at', type: 'number' },
      { name: 'created_by_uid', type: 'text' },
      { name: 'created_by_email', type: 'text' },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_tenant_members_pair ON tenant_members (tenant_id, user_id)',
    ],
  },
];

function buildCollectionPayload(def, { withIndexes = false } = {}) {
  const payload = {
    name: def.name,
    type: def.type,
    listRule: def.listRule ?? null,
    viewRule: def.viewRule ?? null,
    createRule: def.createRule ?? null,
    updateRule: def.updateRule ?? null,
    deleteRule: def.deleteRule ?? null,
    schema: def.fields.map((f) => normalizeField(f)),
  };
  if (withIndexes && def.indexes?.length) {
    payload.indexes = def.indexes;
  }
  return payload;
}

async function ensureCollection(token, existing, def) {
  const found = existing.find((c) => c.name === def.name);
  if (found) {
    console.log(`✓ collection 已存在: ${def.name}`);
    return found;
  }

  console.log(`+ 建立 collection: ${def.name}`);
  const created = await api(token, '/collections', {
    method: 'POST',
    body: JSON.stringify(buildCollectionPayload(def, { withIndexes: false })),
  });

  if (def.indexes?.length) {
    console.log(`  加 indexes: ${def.name}`);
    await api(token, `/collections/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ indexes: def.indexes }),
    });
  }

  return created;
}

async function main() {
  console.log(`連線至 ${baseUrl} ...`);
  const token = await adminAuth();
  let existing = await listCollections(token);

  await ensureUsersFields(token, existing);
  existing = await listCollections(token);

  for (const def of collectionDefs) {
    await ensureCollection(token, existing, def);
  }

  console.log('\n完成！請將 pocketbase/pb_hooks/tws.pb.js 複製到 NAS 上 PocketBase 的 pb_hooks/ 目錄並重啟。');
  console.log('然後在 users collection 建立帳號並設 is_platform_admin = true。');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
