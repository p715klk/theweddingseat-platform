import { watch, onUnmounted } from 'vue';
import { useAuth } from '@/composables/useAuth';
import { useSuperAdminSettings } from '@/composables/useSuperAdminSettings';

const LOGOUT_REASON_KEY = 'super_admin_logout_reason';
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

export function markIdleLogout() {
  try {
    sessionStorage.setItem(LOGOUT_REASON_KEY, 'idle');
  } catch {
    /* ignore */
  }
}

export function consumeLogoutReason() {
  try {
    const reason = sessionStorage.getItem(LOGOUT_REASON_KEY);
    if (reason) sessionStorage.removeItem(LOGOUT_REASON_KEY);
    return reason;
  } catch {
    return null;
  }
}

export function useIdleLogout(enabled) {
  const { user, logout } = useAuth();
  const { idleTimeoutMinutes } = useSuperAdminSettings();

  let timer = null;
  let lastActivity = Date.now();

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function scheduleCheck() {
    clearTimer();
    if (!enabled?.value || !user.value) return;

    const minutes = idleTimeoutMinutes.value;
    if (!minutes) return;

    const ms = minutes * 60 * 1000;
    timer = setTimeout(async () => {
      const idleMs = Date.now() - lastActivity;
      if (idleMs >= ms && user.value) {
        markIdleLogout();
        await logout();
      } else if (user.value) {
        scheduleCheck();
      }
    }, ms);
  }

  function onActivity() {
    lastActivity = Date.now();
    scheduleCheck();
  }

  function attachListeners() {
    ACTIVITY_EVENTS.forEach((ev) => {
      window.addEventListener(ev, onActivity, { passive: true });
    });
  }

  function detachListeners() {
    ACTIVITY_EVENTS.forEach((ev) => {
      window.removeEventListener(ev, onActivity);
    });
  }

  watch(
    [user, idleTimeoutMinutes, () => enabled?.value],
    ([u, , isEnabled]) => {
      clearTimer();
      detachListeners();
      if (!isEnabled || !u) return;
      lastActivity = Date.now();
      attachListeners();
      scheduleCheck();
    },
    { immediate: true },
  );

  onUnmounted(() => {
    clearTimer();
    detachListeners();
  });
}
