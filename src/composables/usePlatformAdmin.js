import { ref, watch } from 'vue';
import getPocketBase, { isPocketBaseConfigured } from '@/lib/pocketbaseClient';
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
  if (!isPocketBaseConfigured()) {
    platformAdminReady.value = true;
    checkedUid = uid;
    return;
  }
  try {
    const pb = getPocketBase();
    let record = pb.authStore.record;
    if (!record || record.id !== uid) {
      record = await pb.collection('users').getOne(uid);
    }
    isPlatformAdmin.value = record?.is_platform_admin === true;
    checkedUid = uid;
  } catch (e) {
    console.error('platform admin 讀取失敗:', e);
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
