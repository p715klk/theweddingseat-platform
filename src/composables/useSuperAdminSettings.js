import { ref } from 'vue';

const STORAGE_KEY = 'super_admin_idle_timeout_min';

export const IDLE_TIMEOUT_OPTIONS = [
  { value: 0, label: '關閉（不自動登出）' },
  { value: 15, label: '15 分鐘' },
  { value: 30, label: '30 分鐘' },
  { value: 60, label: '1 小時' },
  { value: 120, label: '2 小時' },
];

const DEFAULT_IDLE_MINUTES = 30;

function readIdleTimeoutMinutes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_IDLE_MINUTES;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return DEFAULT_IDLE_MINUTES;
    return IDLE_TIMEOUT_OPTIONS.some((o) => o.value === n) ? n : DEFAULT_IDLE_MINUTES;
  } catch {
    return DEFAULT_IDLE_MINUTES;
  }
}

const idleTimeoutMinutes = ref(readIdleTimeoutMinutes());

export function useSuperAdminSettings() {
  function setIdleTimeoutMinutes(minutes) {
    const n = Number(minutes);
    if (!IDLE_TIMEOUT_OPTIONS.some((o) => o.value === n)) return;
    idleTimeoutMinutes.value = n;
    try {
      localStorage.setItem(STORAGE_KEY, String(n));
    } catch (e) {
      console.warn('無法儲存 idle timeout 設定:', e);
    }
  }

  return {
    idleTimeoutMinutes,
    setIdleTimeoutMinutes,
    IDLE_TIMEOUT_OPTIONS,
  };
}
