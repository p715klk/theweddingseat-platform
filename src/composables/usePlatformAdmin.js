import { ref, watch } from 'vue';
import { get, ref as dbRef } from 'firebase/database';
import { database } from '@/firebase';
import { useAuth } from '@/composables/useAuth';

const isPlatformAdmin = ref(false);
const platformAdminReady = ref(false);
let checkedUid = null;

async function refreshPlatformAdmin(uid) {
  platformAdminReady.value = false;
  isPlatformAdmin.value = false;
  if (!uid) {
    platformAdminReady.value = true;
    checkedUid = null;
    return;
  }
  try {
    const snap = await get(dbRef(database, `platform_admins/${uid}`));
    isPlatformAdmin.value = snap.val() === true;
    checkedUid = uid;
  } catch (e) {
    const code = String(e?.code || '');
    if (code !== 'PERMISSION_DENIED') {
      console.error('platform_admins 讀取失敗:', e);
    }
    isPlatformAdmin.value = false;
    checkedUid = uid;
  } finally {
    platformAdminReady.value = true;
  }
}

export function usePlatformAdmin() {
  const { user, authReady } = useAuth();

  watch(
    [user, authReady],
    ([u, ready]) => {
      if (!ready) return;
      const uid = u?.uid || null;
      if (uid === checkedUid && platformAdminReady.value) return;
      refreshPlatformAdmin(uid);
    },
    { immediate: true },
  );

  return { isPlatformAdmin, platformAdminReady };
}
