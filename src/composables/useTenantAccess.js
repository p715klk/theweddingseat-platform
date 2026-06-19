import { ref, watch } from 'vue';
import { get, ref as dbRef } from '@/rtdb';
import { database } from '@/firebase';
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

async function refreshTenantAccess(uid, tenantId, isPlatformAdmin) {
  const cacheKey = accessCacheKey(uid, tenantId, isPlatformAdmin);

  if (!uid || !tenantId) {
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
    const [memberSnap, ownerSnap] = await Promise.all([
      get(dbRef(database, `tenants/${tenantId}/members/${uid}`)),
      get(dbRef(database, `tenants/${tenantId}/meta/owner_uid`)),
    ]);
    const role = memberSnap.val();
    const isOwner = ownerSnap.val() === uid;
    const isAdmin = role === true || role === 'admin' || isOwner;
    const isReception = role === 'reception';
    canAccessAdmin.value = isAdmin;
    canAddWalkInGuest.value = isAdmin || isReception;
    if (isOwner && role !== true && role !== 'admin') {
      memberRole.value = 'owner';
    } else {
      memberRole.value = role === true ? 'admin' : String(role || '');
    }
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
  const { tenantId } = useTenant();

  watch(
    [user, authReady, tenantId, isPlatformAdmin, platformAdminReady],
    ([u, authOk, tid, platformAdmin, platformOk]) => {
      if (!authOk) return;
      const uid = u?.uid || null;
      // platform admin 檢查進行中時先當非 platform admin，避免因 platformAdminReady=false 而 skip refresh 並卡住 UI
      const effectivePlatformAdmin = platformOk && platformAdmin;
      refreshTenantAccess(uid, tid, effectivePlatformAdmin);
    },
    { immediate: true },
  );

  return { canAccessAdmin, canAddWalkInGuest, memberRole, tenantAccessReady };
}
