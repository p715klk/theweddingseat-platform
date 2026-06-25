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

function relationField(name, collectionId, { required = true } = {}) {
  return {
    id: fieldId(),
    name,
    type: 'relation',
    system: false,
    required,
    presentable: false,
    options: {
      collectionId,
      cascadeDelete: false,
      minSelect: required ? 1 : 0,
      maxSelect: 1,
      displayFields: [],
    },
  };
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

/** Super Admin 建帳；本人可讀寫自己；Super Admin 可刪；ManageRule 免 oldPassword 重設密碼 */
const usersApiRules = {
  listRule: '@request.auth.is_platform_admin = true || id = @request.auth.id',
  viewRule: '@request.auth.is_platform_admin = true || id = @request.auth.id',
  createRule: '@request.auth.is_platform_admin = true',
  updateRule: '@request.auth.is_platform_admin = true || id = @request.auth.id',
  deleteRule: '@request.auth.is_platform_admin = true',
  manageRule: '@request.auth.is_platform_admin = true',
};

const platformAdmin = '@request.auth.is_platform_admin = true';

/** 用戶喺該 project 有任何角色（owner / admin / reception） */
const tenantMemberAny =
  '@collection.tenant_members.user_id ?= @request.auth.id && @collection.tenant_members.tenant_id ?= tenant_id';

/** 該 project 嘅 Owner（角色喺 tenant_members，唔再用 tenants.owner_uid） */
const tenantMemberOwner =
  '@collection.tenant_members.user_id ?= @request.auth.id && @collection.tenant_members.tenant_id ?= tenant_id && @collection.tenant_members.role = "owner"';

/** Owner 或 Admin 可管理 project 設定 */
const tenantMemberManager =
  '@collection.tenant_members.user_id ?= @request.auth.id && @collection.tenant_members.tenant_id ?= tenant_id && (@collection.tenant_members.role = "owner" || @collection.tenant_members.role = "admin")';

/** 任何人持 slug URL 可讀活動 project meta（Admin 登入前、賓客 check-in 都需要） */
const tenantsPublicBySlug = 'slug != ""';

const tenantsApiRules = {
  listRule: `${platformAdmin} || ${tenantMemberAny} || ${tenantsPublicBySlug}`,
  viewRule: null,
  createRule: platformAdmin,
  updateRule: `${platformAdmin} || ${tenantMemberManager}`,
  deleteRule: platformAdmin,
};

/** tenant_members — Owner 可經 hook 或 API 管理成員 */
const tenantMembersOwnerRow =
  '@collection.tenant_members.user_id ?= @request.auth.id && @collection.tenant_members.tenant_id ?= tenant_id && @collection.tenant_members.role = "owner"';

/** Owner / Admin 可列出該 project 全部成員 */
const tenantMembersManagerRow =
  '@collection.tenant_members.user_id ?= @request.auth.id && @collection.tenant_members.tenant_id ?= tenant_id && (@collection.tenant_members.role = "owner" || @collection.tenant_members.role = "admin")';

const tenantMembersApiRules = {
  listRule: `${platformAdmin} || user_id = @request.auth.id || ${tenantMembersManagerRow}`,
  viewRule: `${platformAdmin} || user_id = @request.auth.id || ${tenantMembersManagerRow}`,
  createRule: `${platformAdmin} || ${tenantMembersOwnerRow}`,
  updateRule: `${platformAdmin} || ${tenantMembersOwnerRow}`,
  deleteRule: `${platformAdmin} || ${tenantMembersOwnerRow}`,
};

/** 持 project 連結可讀 check-in 資料（filter 由 client 指定 tenant_id） */
const tenantDataPublicByTenant =
  '@collection.tenants.tenant_id ?= tenant_id && @collection.tenants.slug != ""';

const tenantDataApiRulesTight = {
  listRule: `${platformAdmin} || ${tenantMemberAny} || ${tenantDataPublicByTenant}`,
  viewRule: null,
  createRule: platformAdmin,
  updateRule: `${platformAdmin} || ${tenantMemberAny}`,
  deleteRule: platformAdmin,
};

const tenantDataApiRulesFallback = {
  listRule: `${platformAdmin} || @request.auth.id != ""`,
  viewRule: `${platformAdmin} || @request.auth.id != ""`,
  createRule: platformAdmin,
  updateRule: `${platformAdmin} || @request.auth.id != ""`,
  deleteRule: platformAdmin,
};

async function ensureUsersCollection(token, existing) {
  const users = existing.find((c) => c.name === 'users');
  if (!users) {
    console.log('! 找不到 users auth collection');
    return;
  }

  const names = new Set(users.schema.map((f) => f.name));
  const missing = userFieldDefs.filter((f) => !names.has(f.name));
  const schema = missing.length
    ? [...users.schema, ...missing.map((f) => normalizeField(f))]
    : users.schema;

  const rulesChanged = Object.entries(usersApiRules).some(
    ([key, val]) => users[key] !== val,
  );

  if (missing.length || rulesChanged) {
    const patch = { ...usersApiRules };
    if (missing.length) {
      patch.schema = schema;
      console.log(`+ 更新 users 欄位: ${missing.map((f) => f.name).join(', ')}`);
    }
    if (rulesChanged) {
      console.log('+ 更新 users API rules（Super Admin 建帳）');
    }
    await api(token, `/collections/${users.id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  } else {
    console.log('✓ users 欄位與 rules 已齊');
  }
}

async function syncCollectionRules(token, existing, name, rules, { fallbackRules = null } = {}) {
  const col = existing.find((c) => c.name === name);
  if (!col) return;

  const patch = {};
  for (const [key, val] of Object.entries(rules)) {
    if (col[key] !== val) patch[key] = val;
  }
  if (!Object.keys(patch).length) {
    console.log(`✓ ${name} rules 已齊`);
    return;
  }

  console.log(`+ 更新 ${name} rules: ${Object.keys(patch).join(', ')}`);
  try {
    await api(token, `/collections/${col.id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    console.log(`✓ ${name} rules 已更新`);
    return;
  } catch (err) {
    console.error(`! ${name} 批次更新失敗: ${err.message}`);
    if (fallbackRules) {
      console.log(`  嘗試 ${name} fallback rules...`);
      return syncCollectionRules(token, existing, name, fallbackRules);
    }
  }

  // 逐條更新；viewRule 失敗時改為 null（沿用 listRule）
  for (const [key, val] of Object.entries(patch)) {
    let ruleVal = val;
    if (key === 'viewRule') {
      try {
        await api(token, `/collections/${col.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ [key]: ruleVal }),
        });
        console.log(`✓ ${name}.${key}`);
        continue;
      } catch {
        ruleVal = null;
        console.log(`  ${name}.viewRule 無效，改用 null（沿用 listRule）`);
      }
    }
    await api(token, `/collections/${col.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ [key]: ruleVal }),
    });
    console.log(`✓ ${name}.${key}`);
  }
}

const collectionDefs = [
  {
    name: 'tenants',
    type: 'base',
    ...tenantsApiRules,
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
    ...tenantDataApiRulesTight,
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
    ...tenantMembersApiRules,
    fields: [
      { name: 'tenant_id', type: 'text', required: true },
      { name: 'user_id', type: 'text', required: true },
      {
        name: 'role',
        type: 'select',
        required: true,
        options: { maxSelect: 1, values: ['owner', 'admin', 'reception'] },
      },
      { name: 'created_at', type: 'number', required: false },
      { name: 'display_name', type: 'text', required: false },
    ],
    relationFields: ['user', 'tenant'],
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

async function ensureTenantMembersSchema(token, existing) {
  const users = existing.find((c) => c.name === 'users');
  const tenants = existing.find((c) => c.name === 'tenants');
  const members = existing.find((c) => c.name === 'tenant_members');
  if (!members) return;

  const schema = [...members.schema];
  let changed = false;

  const roleIdx = schema.findIndex((f) => f.name === 'role');
  if (roleIdx >= 0) {
    const vals = schema[roleIdx].options?.values || [];
    if (!vals.includes('owner')) {
      schema[roleIdx] = {
        ...schema[roleIdx],
        options: {
          ...schema[roleIdx].options,
          values: ['owner', ...vals.filter((v) => v !== 'owner')],
        },
      };
      changed = true;
      console.log('+ tenant_members.role 加入 owner');
    }
  }

  const names = new Set(schema.map((f) => f.name));
  if (users && !names.has('user')) {
    schema.push(relationField('user', users.id, { required: false }));
    changed = true;
    console.log('+ tenant_members.user relation → users');
  }
  if (tenants && !names.has('tenant')) {
    schema.push(relationField('tenant', tenants.id, { required: false }));
    changed = true;
    console.log('+ tenant_members.tenant relation → tenants');
  }
  if (!names.has('display_name')) {
    schema.push({ name: 'display_name', type: 'text', required: false });
    changed = true;
    console.log('+ tenant_members.display_name（每個 project 獨立顯示名稱）');
  }

  if (!changed) {
    console.log('✓ tenant_members schema 已齊');
    return;
  }

  await api(token, `/collections/${members.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ schema }),
  });
  console.log('✓ tenant_members schema 已更新');
}

async function migrateMemberDisplayNames(token) {
  let page = 1;
  let migrated = 0;
  for (;;) {
    const data = await api(token, `/collections/tenant_members/records?page=${page}&perPage=100`);
    const items = data.items || [];
    if (!items.length) break;
    for (const m of items) {
      if (String(m.display_name || '').trim()) continue;
      const uid = String(m.user_id || '').trim();
      if (!uid) continue;
      try {
        const u = await api(token, `/collections/users/records/${uid}`);
        const name = String(u.display_name || '').trim();
        if (!name) continue;
        await api(token, `/collections/tenant_members/records/${m.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ display_name: name }),
        });
        migrated += 1;
      } catch {
        /* 略過無法讀寫嘅記錄 */
      }
    }
    if (items.length < 100) break;
    page += 1;
  }
  if (migrated > 0) {
    console.log(`+ 已將 users.display_name 複製到 tenant_members（${migrated} 筆）`);
  }
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

  await ensureUsersCollection(token, existing);
  existing = await listCollections(token);

  for (const def of collectionDefs) {
    await ensureCollection(token, existing, def);
  }

  existing = await listCollections(token);
  await ensureTenantMembersSchema(token, existing);
  await migrateMemberDisplayNames(token);
  existing = await listCollections(token);
  await syncCollectionRules(token, existing, 'tenants', tenantsApiRules);
  await syncCollectionRules(token, existing, 'tenant_members', tenantMembersApiRules);
  await syncCollectionRules(token, existing, 'tenant_data', tenantDataApiRulesTight, {
    fallbackRules: tenantDataApiRulesFallback,
  });

  console.log('\n完成！');
  console.log('- 在 users 建立帳號並設 is_platform_admin = true（Super Admin 登入 /super）');
  console.log('- 角色喺 tenant_members.role：owner / admin / reception（唔再用 tenants.owner_uid）');
  console.log('- 建帳／成員 CUD 經 pb_hooks：create-user、upsert-member、remove-member');
  console.log('- 部署 pocketbase/pb_hooks/tws_routes.pb.js + tws.pb.js；GET /tws/health 確認 version');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
