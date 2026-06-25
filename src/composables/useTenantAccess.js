import { ref, watch } from 'vue';
import { getMemberRole } from '@/lib/pb/members';
import { useAuth } from '@/composables/useAuth';
import { usePlatformAdmin } from '@/composables/usePlatformAdmin';
import { useTenant } from '@/composables/useTenant';

const canAccessAdmin = ref(false);
const canAddWalkInGuest = ref(false);
const memberRole = ref('');
const tenantAccessReady = ref(false);
let checkedKey = null;

function accessCacheKey(uid, tenantId, isPlatformAdmin) {
  return `${uid || ''}:${tenantId || ''}:${isPlatformAdmin ? '1' : '0'}`;
}

async function refreshTenantAccess(uid, tid, ownerUid, isPlatformAdmin) {
  const cacheKey = accessCacheKey(uid, tid, isPlatformAdmin);

  if (!uid || !tid) {
    canAccessAdmin.value = false;
    canAddWalkInGuest.value = false;
    memberRole.value = '';
    tenantAccessReady.value = true;
    checkedKey = cacheKey;
    return;
  }

  if (cacheKey === checkedKey && tenantAccessReady.value) return;

  tenantAccessReady.value = false;
  canAccessAdmin.value = false;
  canAddWalkInGuest.value = false;
  memberRole.value = '';

  if (isPlatformAdmin) {
    canAccessAdmin.value = true;
    canAddWalkInGuest.value = true;
    memberRole.value = 'platform_admin';
    checkedKey = cacheKey;
    tenantAccessReady.value = true;
    return;
  }

  try {
    const role = await getMemberRole(tid, uid, ownerUid);
    const isOwner = role === 'owner';
    const isAdmin = isOwner || role === 'admin';
    const isReception = role === 'reception';
    canAccessAdmin.value = isAdmin;
    canAddWalkInGuest.value = isAdmin || isReception;
    memberRole.value = role;
    checkedKey = cacheKey;
  } catch (e) {
    console.warn('members 權限讀取失敗:', e);
    canAccessAdmin.value = false;
    canAddWalkInGuest.value = false;
    memberRole.value = '';
    checkedKey = cacheKey;
  } finally {
    tenantAccessReady.value = true;
  }
}

export function useTenantAccess() {
  const { user, authReady } = useAuth();
  const { isPlatformAdmin, platformAdminReady } = usePlatformAdmin();
  const { tenantId, meta } = useTenant();

  watch(
    [user, authReady, tenantId, meta, isPlatformAdmin, platformAdminReady],
    ([u, authOk, tid, m, platformAdmin, platformOk]) => {
      if (!authOk) return;
      const uid = u?.uid || null;
      const effectivePlatformAdmin = platformOk && platformAdmin;
      refreshTenantAccess(uid, tid, m?.owner_uid || '', effectivePlatformAdmin);
    },
    { immediate: true },
  );

  return { canAccessAdmin, canAddWalkInGuest, memberRole, tenantAccessReady };
}
