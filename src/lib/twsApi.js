import getPocketBase from '@/lib/pocketbaseClient';

const AUTH_ERROR_MESSAGES = {
  'Failed to create record.': '建立帳號失敗',
  'The email is invalid or already in use.': '此 Email 已被使用',
  'The email is invalid or already in use (case insensitive).': '此 Email 已被使用',
};

function mapApiError(err, fallback = '操作失敗') {
  const raw = String(err?.response?.message || err?.message || fallback);
  for (const [key, msg] of Object.entries(AUTH_ERROR_MESSAGES)) {
    if (raw.includes(key)) return msg;
  }
  return raw;
}

async function twsFetch(path, body) {
  const pb = getPocketBase();
  const headers = { 'Content-Type': 'application/json' };
  if (pb.authStore.token) {
    headers.Authorization = pb.authStore.token;
  }
  const res = await fetch(`${pb.baseUrl}/api/tws/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || mapApiError({ message: data?.error }, '請求失敗'));
  }
  return data;
}

/**
 * 建立 Auth 帳號（唔會取代目前登入 session）
 */
export async function createAuthUserViaRest(email, password) {
  const data = await twsFetch('create-user', {
    email: email.trim(),
    password,
  });
  return {
    uid: data.uid,
    email: data.email,
  };
}

/**
 * 移除專案成員（membership + 若無其他 membership 則刪除 Auth）
 */
export async function callRemoveTenantMember({ tenantId, uid }) {
  return twsFetch('remove-member', { tenantId, uid });
}

/**
 * Super Admin 重設他人密碼
 */
export async function callSetUserPassword({ uid, newPassword }) {
  return twsFetch('set-password', { uid, newPassword });
}
