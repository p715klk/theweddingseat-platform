import { ref, watch } from 'vue';
import { useAuth } from '@/composables/useAuth';
import { useTenant } from '@/composables/useTenant';
import { usePlatformAdmin } from '@/composables/usePlatformAdmin';
import {
  validateTenantMemberLogin,
  tenantLoginRejectionMessage,
} from '@/lib/tenantLoginAccess';
import { setPostLogoutNotice } from '@/lib/logoutNotices';

/**
 * 登入後驗證是否為本 project 成員；非成員（或後台 scope 下嘅 reception）會強制登出。
 * @param {'checkin' | 'admin'} scope
 */
export function useTenantLoginGuard(scope = 'checkin') {
  const { user, authReady, logout } = useAuth();
  const { tenantId, meta, ready } = useTenant();
  const { isPlatformAdmin, platformAdminReady } = usePlatformAdmin();
  const loginGuardReady = ref(true);
  let checkSerial = 0;

  async function enforce() {
    if (!authReady.value || !platformAdminReady.value || !ready.value) return;
    if (!tenantId.value) return;

    if (!user.value) {
      loginGuardReady.value = true;
      return;
    }

    const serial = ++checkSerial;
    loginGuardReady.value = false;
    try {
      const result = await validateTenantMemberLogin(
        tenantId.value,
        user.value.uid,
        meta.value?.owner_uid || '',
        isPlatformAdmin.value,
        scope,
      );
      if (serial !== checkSerial) return;
      if (!result.ok) {
        setPostLogoutNotice(tenantLoginRejectionMessage(result.code));
        await logout();
      }
    } catch (e) {
      console.warn('專案登入驗證失敗:', e);
      if (serial === checkSerial) {
        setPostLogoutNotice(tenantLoginRejectionMessage('not_member'));
        await logout();
      }
    } finally {
      if (serial === checkSerial) loginGuardReady.value = true;
    }
  }

  watch(
    [user, authReady, platformAdminReady, ready, tenantId, isPlatformAdmin],
    () => {
      void enforce();
    },
    { immediate: true },
  );

  return { loginGuardReady };
}
