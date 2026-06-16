import { ref, watch } from 'vue';
import { get, ref as dbRef } from 'firebase/database';
import { database } from '@/firebase';
import { useAuth } from '@/composables/useAuth';
import { usePlatformAdmin } from '@/composables/usePlatformAdmin';
import { useTenant } from '@/composables/useTenant';

const canAccessAdmin = ref(false);
const canAddWalkInGuest = ref(false);
const memberRole = ref('');
const tenantAccessReady = ref(false);
let checkedKey = null;

async function refreshTenantAccess(uid, tenantId, isPlatformAdmin) {
  tenantAccessReady.value = false;
  canAccessAdmin.value = false;
  canAddWalkInGuest.value = false;
  memberRole.value = '';

  if (!uid || !tenantId) {
    tenantAccessReady.value = true;
    checkedKey = null;
    return;
  }

  if (isPlatformAdmin) {
    canAccessAdmin.value = true;
    canAddWalkInGuest.value = true;
    memberRole.value = 'platform_admin';
    checkedKey = `${uid}:${tenantId}`;
    tenantAccessReady.value = true;
    return;
  }

  try {
    const snap = await get(dbRef(database, `tenants/${tenantId}/members/${uid}`));
    const role = snap.val();
    const isAdmin = role === true || role === 'admin';
    const isReception = role === 'reception';
    canAccessAdmin.value = isAdmin;
    canAddWalkInGuest.value = isAdmin || isReception;
    memberRole.value = role === true ? 'admin' : String(role || '');
    checkedKey = `${uid}:${tenantId}`;
  } catch (e) {
    console.warn('members 權限讀取失敗:', e);
    canAccessAdmin.value = false;
    canAddWalkInGuest.value = false;
    memberRole.value = '';
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

  return { canAccessAdmin, canAddWalkInGuest, memberRole, tenantAccessReady };
}
