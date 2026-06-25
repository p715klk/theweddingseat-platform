import { computed, onUnmounted, ref, unref, watch } from 'vue';
import { callCheckMemberEmail } from '@/lib/twsApi';
import { normalizeEmail } from '@/lib/superAdminProvisioning';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 輸入 Email 時即時檢查：新帳號 / 可重用 / 已是本專案成員
 */
export function useMemberEmailCheck(emailSource, options = {}) {
  const status = ref('idle');
  const hint = ref('');
  const projects = ref([]);
  const memberRole = ref('');

  const canProceed = computed(() => status.value === 'new' || status.value === 'reuse');
  const isBlocking = computed(() => status.value === 'member' || status.value === 'invalid');
  const isChecking = computed(() => status.value === 'checking');
  const isReuse = computed(() => status.value === 'reuse');

  let timer = null;
  let seq = 0;

  async function runCheck(raw) {
    const normalized = normalizeEmail(raw);
    const tenantId = String(unref(options.tenantId) || '').trim();

    if (!normalized) {
      status.value = 'idle';
      hint.value = '';
      projects.value = [];
      memberRole.value = '';
      return;
    }
    if (!EMAIL_RE.test(normalized)) {
      status.value = 'invalid';
      hint.value = 'Email 格式無效';
      projects.value = [];
      memberRole.value = '';
      return;
    }

    const currentSeq = ++seq;
    status.value = 'checking';
    hint.value = '';
    try {
      const data = await callCheckMemberEmail({ email: normalized, tenantId });
      if (currentSeq !== seq) return;
      status.value = data.status || 'error';
      hint.value = data.message || '';
      projects.value = Array.isArray(data.projects) ? data.projects : [];
      memberRole.value = data.memberRole || '';
    } catch (err) {
      if (currentSeq !== seq) return;
      status.value = 'error';
      hint.value = err?.message || '無法檢查 Email';
      projects.value = [];
      memberRole.value = '';
    }
  }

  function scheduleCheck(raw) {
    clearTimeout(timer);
    timer = setTimeout(() => runCheck(raw), options.debounceMs ?? 400);
  }

  watch(() => unref(emailSource), (val) => scheduleCheck(val));

  onUnmounted(() => {
    clearTimeout(timer);
  });

  // 請在 component 內解構使用，template 先會正確 unwrap ref/computed
  return {
    status,
    hint,
    projects,
    memberRole,
    canProceed,
    isBlocking,
    isChecking,
    isReuse,
    recheck: () => runCheck(unref(emailSource)),
  };
}
