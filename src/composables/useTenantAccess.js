import { ref, watch } from 'vue';
import { get, ref as dbRef } from 'firebase/database';
import { database } from '@/firebase';
import { useAuth } from '@/composables/useAuth';
import { usePlatformAdmin } from '@/composables/usePlatformAdmin';
import { useTenant } from '@/composables/useTenant';

const canAccessAdmin = ref(false);
const tenantAccessReady = ref(false);
let checkedKey = null;

async function refreshTenantAccess(uid, tenantId, isPlatformAdmin) {
  tenantAccessReady.value = false;
  canAccessAdmin.value = false;

  if (!uid || !tenantId) {
    tenantAccessReady.value = true;
    checkedKey = null;
    return;
  }

  if (isPlatformAdmin) {
    canAccessAdmin.value = true;
    checkedKey = `${uid}:${tenantId}`;
    tenantAccessReady.value = true;
    return;
  }

  try {
    const snap = await get(dbRef(database, `tenants/${tenantId}/members/${uid}`));
    canAccessAdmin.value = snap.val() === true;
    checkedKey = `${uid}:${tenantId}`;
  } catch (e) {
    console.warn('members 權限讀取失敗:', e);
    canAccessAdmin.value = false;
    checkedKey = `${uid}:${tenantId}`;
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
      if (!authOk || !platformOk) return;
      const uid = u?.uid || null;
      const key = `${uid || ''}:${tid || ''}:${platformAdmin}`;
      if (key === checkedKey && tenantAccessReady.value) return;
      refreshTenantAccess(uid, tid, platformAdmin);
    },
    { immediate: true },
  );

  return { canAccessAdmin, tenantAccessReady };
}
