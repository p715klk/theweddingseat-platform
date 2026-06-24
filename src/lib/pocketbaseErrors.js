/**
 * 將 PocketBase 登入錯誤轉成使用者可讀訊息。
 */
export function mapPocketBaseLoginError(err) {
  const status = err?.status ?? err?.response?.status;
  const raw = String(err?.response?.message || err?.message || '');

  if (status === 400 || raw.includes('Failed to authenticate')) {
    return 'Email 或密碼錯誤';
  }

  if (
    raw.includes('Failed to fetch') ||
    raw.includes('NetworkError') ||
    raw.includes('Load failed') ||
    raw.includes('Network request failed') ||
    err?.name === 'TypeError'
  ) {
    return '無法連接 PocketBase。GitHub Pages 係 HTTPS，後端必須用 HTTPS 網址（唔可以用 http://），並在 PocketBase Admin → Settings 加入允許來源。';
  }

  return raw || '登入失敗';
}
