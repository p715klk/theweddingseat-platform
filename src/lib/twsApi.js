import getPocketBase from '@/lib/pocketbaseClient';

const AUTH_ERROR_MESSAGES = {
  'Failed to create record.': '建立帳號失敗',
  'The email is invalid or already in use.': '此 Email 已被使用',
  'The email is invalid or already in use (case insensitive).': '此 Email 已被使用',
};

function flattenPbFieldErrors(data) {
  if (!data || typeof data !== 'object') return [];
  return Object.values(data).flatMap((val) => {
    if (typeof val === 'string') return [val];
    if (Array.isArray(val)) {
      return val.flatMap((item) => {
        if (typeof item === 'string') return [item];
        if (item?.message) return [String(item.message)];
        return [];
      });
    }
    if (val?.message) return [String(val.message)];
    return [];
  });
}

function mapApiError(err, fallback = '操作失敗') {
  const data = err?.response?.data;
  const fieldMsgs = flattenPbFieldErrors(data);
  if (fieldMsgs.length) return fieldMsgs.join('；');
  const raw = String(err?.response?.message || err?.message || fallback);
  for (const [key, msg] of Object.entries(AUTH_ERROR_MESSAGES)) {
    if (raw.includes(key)) return msg;
  }
  if (raw.includes('already in use')) return '此 Email 已被使用';
  return raw;
}

function escPbFilterString(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function isPlatformAdminSession(pb) {
  return pb.authStore.isValid && pb.authStore.record?.is_platform_admin === true;
}

function isTwsNotFoundError(err) {
  const status = err?.status ?? err?.response?.status;
  return status === 404;
}

const HOOKS_MISSING_MSG =
  'PocketBase 未載入自訂 API（pb_hooks）。建帳與 remove-member 需要 hooks；可試 GET /tws/health 驗證。';

async function pbDirectCreateOrReuseUser(email, password, profile = {}, options = {}) {
  const pb = getPocketBase();
  if (!isPlatformAdminSession(pb)) {
    throw new Error(HOOKS_MISSING_MSG);
  }
  const tenantId = String(options.tenantId || '').trim();
  const filter = `email = "${escPbFilterString(email)}"`;
  const list = await pb.collection('users').getList(1, 1, { filter });
  const existing = list.items?.[0];
  if (existing?.id) {
    if (tenantId) {
      const members = await pb.collection('tenant_members').getList(1, 1, {
        filter: `tenant_id = "${escPbFilterString(tenantId)}" && user_id = "${escPbFilterString(existing.id)}"`,
      });
      if (members.items?.[0]) {
        throw new Error('此 Email 已是本專案成員');
      }
    }
    return { uid: existing.id, email: existing.email || email, reused: true };
  }
  const pw = String(password || '');
  if (pw.length < 6) throw new Error('密碼至少需要 6 個字元');
  const record = await pb.collection('users').create({
    email,
    password: pw,
    passwordConfirm: pw,
    display_name: String(profile.display_name || '').trim(),
    initial_password: String(profile.initial_password || pw).trim(),
  });
  return { uid: record.id, email: record.email || email, reused: false };
}

async function pbDirectUpsertTenantMember({ tenantId, uid, role = 'admin', display_name = null }) {
  const pb = getPocketBase();
  if (!isPlatformAdminSession(pb)) {
    throw new Error(HOOKS_MISSING_MSG);
  }
  const tid = String(tenantId || '').trim();
  const id = String(uid || '').trim();
  if (!tid || !id) throw new Error('缺少 tenantId 或 uid');

  const tenants = await pb.collection('tenants').getList(1, 1, {
    filter: `tenant_id = "${escPbFilterString(tid)}"`,
  });
  const tenant = tenants.items?.[0];
  if (!tenant) throw new Error('找不到專案');

  const members = await pb.collection('tenant_members').getList(1, 1, {
    filter: `tenant_id = "${escPbFilterString(tid)}" && user_id = "${escPbFilterString(id)}"`,
  });
  const payload = {
    tenant_id: tid,
    user_id: id,
    role,
    ...(display_name != null ? { display_name: String(display_name || '') } : {}),
  };
  const existing = members.items?.[0];
  if (existing) {
    await pb.collection('tenant_members').update(existing.id, payload);
    return { tenantId: tid, uid: id, created: false };
  }
  await pb.collection('tenant_members').create({
    ...payload,
    tenant: tenant.id,
    user: id,
    created_at: Date.now(),
  });
  return { tenantId: tid, uid: id, created: true };
}

async function pbDirectCheckMemberEmail({ email, tenantId = '' }) {
  const pb = getPocketBase();
  if (!isPlatformAdminSession(pb)) {
    throw new Error(HOOKS_MISSING_MSG);
  }
  const filter = `email = "${escPbFilterString(email)}"`;
  const list = await pb.collection('users').getList(1, 1, { filter });
  const existing = list.items?.[0];
  if (!existing?.id) {
    return { status: 'new', message: '此 Email 可以使用', uid: null, projects: [] };
  }
  const uid = existing.id;
  const tid = String(tenantId || '').trim();
  if (tid) {
    const members = await pb.collection('tenant_members').getList(1, 1, {
      filter: `tenant_id = "${escPbFilterString(tid)}" && user_id = "${escPbFilterString(uid)}"`,
    });
    if (members.items?.[0]) {
      return {
        status: 'member',
        message: '此 Email 已是本專案成員',
        uid,
        memberRole: members.items[0].role || '',
        projects: [],
      };
    }
    return {
      status: 'reuse',
      message: '已有登入帳號，會加入本專案（密碼不變）',
      uid,
      projects: [],
    };
  }
  const memList = await pb.collection('tenant_members').getList(1, 50, {
    filter: `user_id = "${escPbFilterString(uid)}"`,
  });
  const projects = [];
  for (const row of memList.items || []) {
    const ptid = String(row.tenant_id || '').trim();
    if (!ptid) continue;
    let slug = ptid;
    try {
      const tenants = await pb.collection('tenants').getList(1, 1, {
        filter: `tenant_id = "${escPbFilterString(ptid)}"`,
      });
      if (tenants.items?.[0]?.slug) slug = tenants.items[0].slug;
    } catch {
      /* ignore */
    }
    projects.push({ tenantId: ptid, slug, role: row.role || '' });
  }
  return {
    status: 'reuse',
    message: '已有登入帳號，會加入新 Project（密碼不變）',
    uid,
    projects,
  };
}

async function twsFetch(path, body) {
  const pb = getPocketBase();
  if (!pb.authStore.isValid) {
    throw new Error('請先登入');
  }
  const headers = {};
  const token = pb.authStore.token;
  if (token) {
    headers.Authorization = String(token).startsWith('Bearer ') ? token : `Bearer ${token}`;
  }
  try {
    return await pb.send(`/tws/${path}`, {
      method: 'POST',
      body,
      headers,
    });
  } catch (err) {
    const status = err?.status ?? err?.response?.status;
    if (status === 404) {
      throw Object.assign(new Error(HOOKS_MISSING_MSG), { status: 404, twsNotFound: true });
    }
    const data = err?.response ?? err?.data ?? {};
    const detail = data?.data ? flattenPbFieldErrors(data.data).join('；') : '';
    const msg = data?.message || err?.message || detail || `請求失敗 (${status || 'unknown'})`;
    if (String(msg).includes('already in use')) {
      throw new Error('此 Email 已被使用');
    }
    throw new Error(mapApiError({ message: msg }, msg));
  }
}

/**
 * 建立 Auth 帳號（經 /tws/create-user；Super Admin 或 Owner 可用）
 */
export async function createAuthUserViaRest(email, password, profile = {}, options = {}) {
  const trimmedEmail = email.trim().toLowerCase();
  const pw = String(password || '');
  const tenantId = String(options.tenantId || '').trim();
  const profilePayload = {
    display_name: String(profile.display_name || '').trim(),
    initial_password: String(profile.initial_password || pw).trim(),
  };
  try {
    const data = await twsFetch('create-user', {
      email: trimmedEmail,
      password: pw,
      tenantId,
      ...profilePayload,
    });
    return {
      uid: data.uid,
      email: data.email || trimmedEmail,
      reused: data.reused === true,
    };
  } catch (err) {
    if (isTwsNotFoundError(err) && isPlatformAdminSession(getPocketBase())) {
      try {
        return await pbDirectCreateOrReuseUser(trimmedEmail, pw, profilePayload, { tenantId });
      } catch (fallbackErr) {
        throw new Error(fallbackErr?.message || HOOKS_MISSING_MSG);
      }
    }
    throw new Error(err?.message || mapApiError(err, '建立帳號失敗'));
  }
}

/**
 * 移除專案成員（membership + 若無其他 membership 則刪除 Auth）— 仍需 pb_hooks
 */
export async function callRemoveTenantMember({ tenantId, uid }) {
  return twsFetch('remove-member', { tenantId, uid });
}

export async function callListTenantMembers({ tenantId }) {
  return twsFetch('list-members', { tenantId });
}

/** Super Admin：列出所有 project 成員（含 email；繞過 users collection 客戶端 API 限制） */
export async function callListAllProjectMembers() {
  return twsFetch('list-all-members', {});
}

export function isTwsHooksMissingError(err) {
  if (err?.twsNotFound === true || err?.status === 404) return true;
  const msg = String(err?.message || '');
  return msg.includes('pb_hooks') || msg.includes('/tws/health');
}

export async function callCreateTenant(payload) {
  return twsFetch('create-tenant', payload);
}

/** 檢查 Email：新帳號 / 可重用 / 已是本專案成員 */
export async function callCheckMemberEmail({ email, tenantId = '' }) {
  const trimmedEmail = String(email || '').trim().toLowerCase();
  const tid = String(tenantId || '').trim();
  if (!trimmedEmail) throw new Error('請輸入 Email');
  try {
    return await twsFetch('check-member-email', { email: trimmedEmail, tenantId: tid });
  } catch (err) {
    if (isTwsHooksMissingError(err) && isPlatformAdminSession(getPocketBase())) {
      return pbDirectCheckMemberEmail({ email: trimmedEmail, tenantId: tid });
    }
    throw new Error(err?.message || '無法檢查 Email');
  }
}

export async function callTransferTenantOwner({ tenantId, newOwnerUid }) {
  return twsFetch('transfer-owner', { tenantId, newOwnerUid });
}

export async function callUpsertTenantMember({ tenantId, uid, role = 'admin', display_name = null }) {
  const body = {
    tenantId,
    uid,
    role,
    ...(display_name != null ? { display_name } : {}),
  };
  try {
    return await twsFetch('upsert-member', body);
  } catch (err) {
    if (isTwsNotFoundError(err) && isPlatformAdminSession(getPocketBase())) {
      return pbDirectUpsertTenantMember(body);
    }
    throw err;
  }
}

export async function callSwapTenantMemberRoles({ tenantId, uidA, uidB }) {
  return twsFetch('swap-member-roles', { tenantId, uidA, uidB });
}

export async function callUpdateMemberProfile({ tenantId, uid, profile }) {
  return twsFetch('update-member-profile', {
    tenantId,
    uid,
    display_name: profile?.display_name ?? '',
  });
}

/**
 * Super Admin 重設他人密碼（users updateRule）
 */
export async function callSetUserPassword({ uid, newPassword }) {
  const id = String(uid || '').trim();
  const pw = String(newPassword || '');
  if (!id) throw new Error('缺少 uid');
  if (pw.length < 6) throw new Error('密碼至少需要 6 個字元');

  try {
    return await twsFetch('set-password', { uid: id, newPassword: pw });
  } catch (err) {
    throw new Error(err?.message || '重設密碼失敗');
  }
}

/** 診斷：Owner 登入後檢查 token 同 ownedTenants */
export async function twsDebugAuth() {
  const pb = getPocketBase();
  const headers = {};
  const token = pb.authStore.token;
  if (token) {
    headers.Authorization = String(token).startsWith('Bearer ') ? token : `Bearer ${token}`;
  }
  return pb.send('/tws/debug-auth', { method: 'GET', headers });
}
