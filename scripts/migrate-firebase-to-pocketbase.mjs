/**
 * 從 Firebase RTDB 匯入資料到 PocketBase（一次性）
 *
 * 需要 .env.local：
 *   VITE_FIREBASE_DATABASE_URL
 *   VITE_POCKETBASE_URL
 *   POCKETBASE_ADMIN_EMAIL
 *   POCKETBASE_ADMIN_PASSWORD
 *   FIREBASE_MIGRATE_EMAIL + FIREBASE_MIGRATE_PASSWORD（有 RTDB 讀權限的帳號）
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

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

const fbDbUrl = (process.env.VITE_FIREBASE_DATABASE_URL || '').replace(/\/$/, '');
const pbUrl = (process.env.VITE_POCKETBASE_URL || process.env.POCKETBASE_URL || '').replace(/\/$/, '');
const pbAdminEmail = process.env.POCKETBASE_ADMIN_EMAIL || '';
const pbAdminPassword = process.env.POCKETBASE_ADMIN_PASSWORD || '';
const fbEmail = process.env.FIREBASE_MIGRATE_EMAIL || '';
const fbPassword = process.env.FIREBASE_MIGRATE_PASSWORD || '';
const fbApiKey = process.env.VITE_FIREBASE_API_KEY || '';

async function firebaseLogin() {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(fbApiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: fbEmail, password: fbPassword, returnSecureToken: true }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Firebase 登入失敗');
  return data.idToken;
}

async function readFirebaseRtdb(idToken) {
  const res = await fetch(`${fbDbUrl}/.json?auth=${encodeURIComponent(idToken)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || '讀取 RTDB 失敗');
  return data || {};
}

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
  if (!res.ok) throw new Error(data?.message || `PB ${path} 失敗`);
  return data;
}

async function upsertTenant(token, tenantId, meta, dataPayload) {
  const filter = encodeURIComponent(`tenant_id = "${tenantId}"`);
  const existing = await pbApi(token, `/collections/tenants/records?filter=${filter}&perPage=1`);
  const fields = {
    tenant_id: tenantId,
    slug: meta.slug || tenantId,
    couple_names: meta.couple_names || '',
    venue_name: meta.venue_name || '',
    venue_hall: meta.venue_hall || '',
    wedding_date: meta.wedding_date || '',
    theme_color: meta.theme_color || '#b91c1c',
    status: meta.status || 'active',
    plan: meta.plan || 'standard',
    owner_uid: meta.owner_uid || '',
    features: meta.features || { checkin: true, guestlist: true, seating: true },
    created_at: meta.created_at || Date.now(),
    created_by_uid: meta.created_by_uid || '',
    created_by_email: meta.created_by_email || '',
    updated_at: meta.updated_at || Date.now(),
    updated_by_uid: meta.updated_by_uid || '',
    updated_by_email: meta.updated_by_email || '',
  };
  if (existing.items?.[0]) {
    await pbApi(token, `/collections/tenants/records/${existing.items[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    });
  } else {
    await pbApi(token, '/collections/tenants/records', {
      method: 'POST',
      body: JSON.stringify(fields),
    });
  }

  const dataFilter = encodeURIComponent(`tenant_id = "${tenantId}"`);
  const dataExisting = await pbApi(token, `/collections/tenant_data/records?filter=${dataFilter}&perPage=1`);
  const dataFields = {
    tenant_id: tenantId,
    wedding_guests: dataPayload.wedding_guests || {},
    unassigned_guests: dataPayload.unassigned_guests || [],
    guest_status: dataPayload.guest_status || {},
    table_settings: dataPayload.table_settings || {},
    floor_layout: dataPayload.floor_layout || {},
    meta_label_columns: dataPayload.meta_label_columns || {},
  };
  if (dataExisting.items?.[0]) {
    await pbApi(token, `/collections/tenant_data/records/${dataExisting.items[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify(dataFields),
    });
  } else {
    await pbApi(token, '/collections/tenant_data/records', {
      method: 'POST',
      body: JSON.stringify(dataFields),
    });
  }
}

async function upsertMember(token, tenantId, uid, role, profile) {
  const filter = encodeURIComponent(`tenant_id = "${tenantId}" && user_id = "${uid}"`);
  const existing = await pbApi(token, `/collections/tenant_members/records?filter=${filter}&perPage=1`);
  const memberFields = {
    tenant_id: tenantId,
    user_id: uid,
    role: role === true || role === 'admin' ? 'admin' : 'reception',
    created_at: profile?.created_at || Date.now(),
  };
  if (existing.items?.[0]) {
    await pbApi(token, `/collections/tenant_members/records/${existing.items[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify(memberFields),
    });
  } else {
    await pbApi(token, '/collections/tenant_members/records', {
      method: 'POST',
      body: JSON.stringify(memberFields),
    });
  }
  if (profile) {
    await pbApi(token, `/collections/users/records/${uid}`, {
      method: 'PATCH',
      body: JSON.stringify({
        display_name: profile.display_name || '',
        initial_password: profile.initial_password || '',
        created_at: profile.created_at || Date.now(),
        created_by_uid: profile.created_by_uid || '',
        created_by_email: profile.created_by_email || '',
      }),
    });
  }
}

async function main() {
  if (!fbDbUrl || !pbUrl || !pbAdminEmail || !pbAdminPassword || !fbEmail || !fbPassword || !fbApiKey) {
    console.error('請設定 Firebase 與 PocketBase 相關環境變數（見腳本頂部註解）');
    process.exit(1);
  }

  console.log('Firebase 登入...');
  const idToken = await firebaseLogin();
  console.log('讀取 RTDB...');
  const root = await readFirebaseRtdb(idToken);
  console.log('PocketBase admin 登入...');
  const token = await pbAdminAuth();

  const tenants = root.tenants || {};
  for (const [tenantId, tenantNode] of Object.entries(tenants)) {
    const meta = tenantNode.meta || {};
    console.log(`匯入 tenant: ${tenantId}`);
    await upsertTenant(token, tenantId, meta, {
      wedding_guests: tenantNode.wedding_guests,
      unassigned_guests: tenantNode.unassigned_guests,
      guest_status: tenantNode.guest_status,
      table_settings: tenantNode.table_settings,
      floor_layout: tenantNode.floor_layout,
      meta_label_columns: tenantNode.meta_label_columns,
    });
    const members = tenantNode.members || {};
    const profiles = tenantNode.user_profiles || {};
    for (const [uid, role] of Object.entries(members)) {
      await upsertMember(token, tenantId, uid, role, profiles[uid]);
    }
  }

  const platformAdmins = root.platform_admins || {};
  const platformProfiles = root.platform_admin_profiles || {};
  for (const [uid, ok] of Object.entries(platformAdmins)) {
    if (!ok) continue;
    try {
      await pbApi(token, `/collections/users/records/${uid}`, {
        method: 'PATCH',
        body: JSON.stringify({
          is_platform_admin: true,
          display_name: platformProfiles[uid]?.display_name || '',
        }),
      });
      console.log(`標記 platform admin: ${uid}`);
    } catch {
      console.warn(`跳過 platform admin ${uid}（users 記錄可能未建立）`);
    }
  }

  console.log('\n匯入完成！請確認 PocketBase users 帳號已存在（Auth 用戶需另行建立或手動匯入）。');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
