const KEY = 'tws_post_logout_notice';

export function setPostLogoutNotice(message) {
  try {
    sessionStorage.setItem(KEY, String(message || ''));
  } catch {
    /* ignore */
  }
}

export function consumePostLogoutNotice() {
  try {
    const msg = sessionStorage.getItem(KEY);
    if (msg) sessionStorage.removeItem(KEY);
    return msg || '';
  } catch {
    return '';
  }
}

