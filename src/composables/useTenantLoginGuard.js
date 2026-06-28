import { ref, watch } from 'vue';
import { useAuth } from '@/composables/useAuth';
import { useTenant } from '@/composables/useTenant';
import { usePlatformAdmin } from '@/composables/usePlatformAdmin';
import {
  validateTenantMemberLogin,
  tenantLoginRejectionMessage,
} from '@/lib/tenantLoginAccess';
import { setPostLogoutNotice } from '@/lib/logoutNotices';
import { getAuditPageContext, logLoginOnce } from '@/lib/auditLog';

/**
 * 登入後驗證是否為本 project 成員。
 * - checkin：非成員強制登出
 * - admin：非成員強制登出；reception 保留登入，由 TenantAccessDenied 引導去點名頁
 * @param {'checkin' | 'admin'} scope
 */
export function useTenantLoginGuard(scope = 'checkin') {
  const { user, authReady, logout } = useAuth();
  const { tenantId, meta, ready } = useTenant();
  const { isPlatformAdmin, platformAdminReady } = usePlatformAdmin();
  const loginGuardReady = ref(true);
  let checkSerial = 0;

  function shouldForceLogout(result) {
    if (result.ok) return false;
    if (scope === 'admin' && result.code === 'reception_only') return false;
    return true;
  }

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
      if (result.ok) {
        const { page } = getAuditPageContext();
        if (page) {
          logLoginOnce({
            tenantId: tenantId.value,
            uid: user.value.uid,
            page,
          });
        }
      } else if (shouldForceLogout(result)) {
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
