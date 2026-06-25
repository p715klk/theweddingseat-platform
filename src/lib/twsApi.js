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
      throw new Error(
        'PocketBase 未載入自訂 API（pb_hooks）。建帳與 remove-member 需要 hooks；可試 GET /tws/health 驗證。',
      );
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
  try {
    const data = await twsFetch('create-user', {
      email: trimmedEmail,
      password: pw,
      tenantId,
      display_name: String(profile.display_name || '').trim(),
      initial_password: String(profile.initial_password || pw).trim(),
    });
    return {
      uid: data.uid,
      email: data.email || trimmedEmail,
    };
  } catch (err) {
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

export async function callUpsertTenantMember({ tenantId, uid, role = 'admin' }) {
  return twsFetch('upsert-member', { tenantId, uid, role });
}

export async function callSwapTenantMemberRoles({ tenantId, uidA, uidB }) {
  return twsFetch('swap-member-roles', { tenantId, uidA, uidB });
}

export async function callUpdateMemberProfile({ tenantId, uid, profile }) {
  return twsFetch('update-member-profile', {
    tenantId,
    uid,
    display_name: profile?.display_name ?? '',
    initial_password: profile?.initial_password ?? '',
    created_at: profile?.created_at,
    created_by_uid: profile?.created_by_uid,
    created_by_email: profile?.created_by_email,
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
