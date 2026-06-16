import { firebaseConfig } from '@/firebase';

const AUTH_ERROR_MESSAGES = {
  EMAIL_EXISTS: '此 Email 已被使用',
  INVALID_EMAIL: 'Email 格式無效',
  WEAK_PASSWORD: '密碼太弱（至少 6 個字元）',
  OPERATION_NOT_ALLOWED: 'Email 註冊未啟用，請聯絡平台管理員',
  TOO_MANY_ATTEMPTS_TRY_LATER: '嘗試次數過多，請稍後再試',
};

function mapAuthRestError(code) {
  return AUTH_ERROR_MESSAGES[code] || `建立帳號失敗（${code}）`;
}

/**
 * 透過 Firebase Auth REST API 建立帳號（唔會取代目前登入 session）
 */
export async function createAuthUserViaRest(email, password) {
  const apiKey = firebaseConfig.apiKey;
  if (!apiKey) {
    throw new Error('未設定 Firebase apiKey');
  }

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim(),
        password,
        returnSecureToken: false,
      }),
    },
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(mapAuthRestError(data?.error?.message || 'UNKNOWN'));
  }

  return {
    uid: data.localId,
    email: data.email,
  };
}
