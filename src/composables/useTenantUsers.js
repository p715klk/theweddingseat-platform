import { ref } from 'vue';
import { get, set, remove, update, ref as dbRef } from '@/rtdb';
import { database } from '@/firebase';
import { useTenant } from '@/composables/useTenant';
import { useAuth } from '@/composables/useAuth';
import { usePlatformAdmin } from '@/composables/usePlatformAdmin';
import { createAuthUserViaRest } from '@/lib/firebaseAuthRest';

export function useTenantUsers() {
  const { tenantId, tenantRef, meta } = useTenant();
  const { user } = useAuth();
  const { isPlatformAdmin } = usePlatformAdmin();

  const members = ref([]);
  const loading = ref(false);
  const error = ref('');

  function normalizeMemberRole(val) {
    if (val === true) return 'admin'; // legacy
    if (val === 'admin' || val === 'reception') return val;
    return '';
  }

  function editorInfo() {
    if (!user.value) return null;
    return {
      uid: user.value.uid,
      email: user.value.email || '',
    };
  }

  async function loadMembers() {
    if (!tenantId.value) return;
    loading.value = true;
    error.value = '';
    try {
      const [membersSnap, profilesSnap] = await Promise.all([
        get(tenantRef('members')),
        get(tenantRef('user_profiles')),
      ]);
      const memberMap = membersSnap.val() || {};
      const profiles = profilesSnap.val() || {};
      const uids = Object.keys(memberMap).filter((uid) => normalizeMemberRole(memberMap[uid]));

      members.value = uids.map((uid) => ({
        uid,
        role: normalizeMemberRole(memberMap[uid]),
        email: profiles[uid]?.email || '',
        displayName: profiles[uid]?.display_name || '',
        createdAt: profiles[uid]?.created_at || null,
        createdByEmail: profiles[uid]?.created_by_email || '',
        isSelf: uid === user.value?.uid,
      }));
    } catch (e) {
      error.value = e?.message || '載入用戶清單失敗';
      members.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function createMember({ email, password, displayName = '', role = 'admin' }) {
    if (!tenantId.value) throw new Error('專案未就緒');
    if (!isPlatformAdmin.value && meta.value?.owner_uid && meta.value.owner_uid !== user.value?.uid) {
      throw new Error('只有 owner 可以新增用戶');
    }
    if (role !== 'admin' && role !== 'reception') throw new Error('無效的角色');
    const trimmedEmail = email?.trim();
    if (!trimmedEmail) throw new Error('請輸入 Email');
    if (!password || password.length < 6) throw new Error('密碼至少需要 6 個字元');

    const { uid } = await createAuthUserViaRest(trimmedEmail, password);
    const editor = editorInfo();

    const profile = {
      email: trimmedEmail,
      display_name: displayName.trim(),
      created_at: Date.now(),
      created_by_uid: editor?.uid || '',
      created_by_email: editor?.email || '',
    };

    await update(dbRef(database), {
      [`tenants/${tenantId.value}/members/${uid}`]: role,
      [`tenants/${tenantId.value}/user_profiles/${uid}`]: profile,
    });

    await loadMembers();
    return { uid, email: trimmedEmail };
  }

  async function removeMember(uid) {
    if (!tenantId.value) throw new Error('專案未就緒');
    if (!uid) throw new Error('無效的用戶');
    if (uid === user.value?.uid) throw new Error('不能移除自己的帳號');
    if (!isPlatformAdmin.value && meta.value?.owner_uid && meta.value.owner_uid !== user.value?.uid) {
      throw new Error('只有 owner 可以移除用戶');
    }

    const membersSnap = await get(tenantRef('members'));
    const memberMap = membersSnap.val() || {};
    const activeCount = Object.values(memberMap).filter((v) => normalizeMemberRole(v) === 'admin').length;
    if (activeCount <= 1) throw new Error('至少需要保留一位後台用戶');

    await remove(tenantRef(`members/${uid}`));
    try {
      await remove(tenantRef(`user_profiles/${uid}`));
    } catch {
      /* profile may not exist for legacy members */
    }
    await loadMembers();
  }

  async function ensureSelfProfile() {
    if (!tenantId.value || !user.value?.uid || !user.value.email) return;
    const profileRef = tenantRef(`user_profiles/${user.value.uid}`);
    const snap = await get(profileRef);
    if (snap.exists()) return;

    await set(profileRef, {
      email: user.value.email,
      display_name: '',
      created_at: Date.now(),
      created_by_uid: user.value.uid,
      created_by_email: user.value.email,
    });
  }

  async function updateSelfDisplayName(displayName) {
    if (!tenantId.value) throw new Error('專案未就緒');
    if (!user.value?.uid || !user.value.email) throw new Error('未登入');
    const name = String(displayName || '').trim();
    if (name.length > 40) throw new Error('顯示名稱太長（最多 40 字）');

    const profileRef = tenantRef(`user_profiles/${user.value.uid}`);
    const snap = await get(profileRef);
    const current = snap.exists() ? snap.val() : null;
    const editor = editorInfo();

    const next = {
      email: current?.email || user.value.email,
      display_name: name,
      created_at: current?.created_at || Date.now(),
      created_by_uid: current?.created_by_uid || editor?.uid || user.value.uid,
      created_by_email: current?.created_by_email || editor?.email || user.value.email,
      ...(current?.initial_password != null ? { initial_password: current.initial_password } : {}),
    };

    await set(profileRef, next);
    await loadMembers();
  }

  return {
    members,
    loading,
    error,
    loadMembers,
    createMember,
    removeMember,
    ensureSelfProfile,
    updateSelfDisplayName,
  };
}
