import { computed, ref, toValue } from 'vue';
import { get, set, ref as dbRef } from '@/rtdb';
import { database } from '@/firebase';
import { useTenant } from '@/composables/useTenant';
import { useAuth } from '@/composables/useAuth';
import { usePlatformAdmin } from '@/composables/usePlatformAdmin';
import { createAuthUserViaRest, callUpdateMemberProfile, callUpsertTenantMember, callSwapTenantMemberRoles } from '@/lib/twsApi';
import { callRemoveTenantMember } from '@/lib/removeTenantMemberCallable';
import { assertCanAddMember, assertCanChangeMemberRole, getMemberQuota } from '@/lib/tenantMemberLimits';

const ROLE_SORT_ORDER = { owner: 0, admin: 1, reception: 2 };

function sortMembers(list) {
  return [...list].sort((a, b) => {
    const ra = ROLE_SORT_ORDER[a.role] ?? 9;
    const rb = ROLE_SORT_ORDER[b.role] ?? 9;
    if (ra !== rb) return ra - rb;
    return String(a.email || a.uid).localeCompare(String(b.email || b.uid), 'zh-Hant');
  });
}

export function useTenantUsers(options = {}) {
  const globalTenant = useTenant();
  const { user } = useAuth();
  const { isPlatformAdmin } = usePlatformAdmin();

  const effectiveTenantId = computed(() => {
    const override = toValue(options.tenantId);
    if (override) return String(override);
    return globalTenant.tenantId.value;
  });

  const effectiveOwnerUid = computed(() => {
    if (options.ownerUid !== undefined) {
      return String(toValue(options.ownerUid) || '');
    }
    return globalTenant.meta.value?.owner_uid || '';
  });

  function tenantRef(subPath = '') {
    const id = effectiveTenantId.value;
    const base = `tenants/${id}`;
    return dbRef(database, subPath ? `${base}/${subPath}` : base);
  }

  const members = ref([]);
  const loading = ref(false);
  const error = ref('');

  function normalizeMemberRole(val) {
    if (val === 'owner') return 'owner';
    if (val === true) return 'admin';
    if (val === 'admin' || val === 'reception') return val;
    return '';
  }

  function isCurrentOwner() {
    const uid = user.value?.uid;
    if (!uid) return false;
    const self = members.value.find((m) => m.uid === uid);
    if (self?.role === 'owner') return true;
    return effectiveOwnerUid.value === uid;
  }

  function editorInfo() {
    if (!user.value) return null;
    return {
      uid: user.value.uid,
      email: user.value.email || '',
    };
  }

  async function loadMembers() {
    if (!effectiveTenantId.value) return;
    loading.value = true;
    error.value = '';
    try {
      const [memberSnap, profilesSnap] = await Promise.all([
        get(tenantRef('members')),
        get(tenantRef('user_profiles')),
      ]);
      const memberMap = memberSnap.val() || {};
      const profiles = profilesSnap.val() || {};
      const uids = Object.keys(memberMap).filter((uid) => normalizeMemberRole(memberMap[uid]));

      members.value = sortMembers(uids.map((uid) => ({
        uid,
        role: normalizeMemberRole(memberMap[uid]),
        email: profiles[uid]?.email || '',
        displayName: profiles[uid]?.display_name || '',
        createdAt: profiles[uid]?.created_at || null,
        createdByEmail: profiles[uid]?.created_by_email || '',
        isSelf: uid === user.value?.uid,
      })));
    } catch (e) {
      error.value = e?.message || '載入用戶清單失敗';
      members.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function createMember({ email, password, displayName = '', role = 'admin', reuseExisting = false }) {
    if (!effectiveTenantId.value) throw new Error('專案未就緒');
    if (role !== 'admin' && role !== 'reception') throw new Error('無效的角色');
    const trimmedEmail = email?.trim();
    if (!trimmedEmail) throw new Error('請輸入 Email');
    if (!reuseExisting && (!password || password.length < 6)) {
      throw new Error('密碼至少需要 6 個字元');
    }

    await loadMembers();
    if (!isPlatformAdmin.value && !isCurrentOwner()) {
      throw new Error('只有 owner 可以新增用戶');
    }
    assertCanAddMember(members.value, effectiveOwnerUid.value, role, {
      bypassLimits: isPlatformAdmin.value,
    });

    const { uid, reused } = await createAuthUserViaRest(
      trimmedEmail,
      password,
      {
        display_name: displayName.trim(),
        initial_password: password,
      },
      { tenantId: effectiveTenantId.value },
    );

    await callUpsertTenantMember({
      tenantId: effectiveTenantId.value,
      uid,
      role,
      display_name: displayName.trim(),
    });

    await loadMembers();
    return { uid, email: trimmedEmail, reused };
  }

  async function removeMember(uid) {
    if (!effectiveTenantId.value) throw new Error('專案未就緒');
    if (!uid) throw new Error('無效的用戶');
    if (uid === user.value?.uid) throw new Error('不能移除自己的帳號');
    if (!isPlatformAdmin.value && !isCurrentOwner()) {
      throw new Error('只有 owner 可以移除用戶');
    }

    const result = await callRemoveTenantMember({
      tenantId: effectiveTenantId.value,
      uid,
    });
    await loadMembers();
    return result;
  }

  async function updateMemberRole(uid, role) {
    if (!effectiveTenantId.value) throw new Error('專案未就緒');
    if (role !== 'admin' && role !== 'reception') throw new Error('無效的角色');
    if (!uid) throw new Error('無效的用戶');
    if (uid === user.value?.uid) throw new Error('不能變更自己的角色');

    await loadMembers();
    const target = members.value.find((m) => m.uid === uid);
    if (!target) throw new Error('找不到用戶');
    if (target.role === 'owner') throw new Error('不能變更 Owner 角色');
    if (target.role === role) return;

    if (!isPlatformAdmin.value && !isCurrentOwner()) {
      throw new Error('只有 owner 可以變更角色');
    }
    assertCanChangeMemberRole(members.value, effectiveOwnerUid.value, uid, role, {
      bypassLimits: isPlatformAdmin.value,
    });

    await callUpsertTenantMember({ tenantId: effectiveTenantId.value, uid, role });
    await loadMembers();
  }

  async function swapMemberRoles(uidA, uidB) {
    if (!effectiveTenantId.value) throw new Error('專案未就緒');
    if (!uidA || !uidB) throw new Error('無效的用戶');
    if (uidA === uidB) throw new Error('無效的用戶');
    if (!isPlatformAdmin.value && !isCurrentOwner()) {
      throw new Error('只有 owner 可以變更角色');
    }
    await callSwapTenantMemberRoles({ tenantId: effectiveTenantId.value, uidA, uidB });
    await loadMembers();
  }

  async function ensureSelfProfile() {
    if (!effectiveTenantId.value || !user.value?.uid || !user.value.email) return;
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

  async function updateMemberDisplayName(uid, displayName) {
    if (!effectiveTenantId.value) throw new Error('專案未就緒');
    if (!uid) throw new Error('無效的用戶');
    const name = String(displayName || '').trim();
    if (name.length > 40) throw new Error('顯示名稱太長（最多 40 字）');

    if (uid !== user.value?.uid && !isPlatformAdmin.value && !isCurrentOwner()) {
      throw new Error('只有 owner 可以修改用戶顯示名稱');
    }

    const profileRef = tenantRef(`user_profiles/${uid}`);
    const snap = await get(profileRef);
    const current = snap.exists() ? snap.val() : null;
    const editor = editorInfo();

    const next = {
      email: current?.email || (uid === user.value?.uid ? user.value.email : '') || '',
      display_name: name,
      created_at: current?.created_at || Date.now(),
      created_by_uid: current?.created_by_uid || editor?.uid || user.value?.uid || '',
      created_by_email: current?.created_by_email || editor?.email || user.value?.email || '',
      ...(current?.initial_password != null ? { initial_password: current.initial_password } : {}),
    };

    await callUpdateMemberProfile({ tenantId: effectiveTenantId.value, uid, profile: next });
    await loadMembers();
  }

  async function updateSelfDisplayName(displayName) {
    if (!user.value?.uid || !user.value.email) throw new Error('未登入');
    await updateMemberDisplayName(user.value.uid, displayName);
  }

  function memberQuota() {
    return getMemberQuota(members.value, effectiveOwnerUid.value);
  }

  return {
    members,
    loading,
    error,
    loadMembers,
    createMember,
    removeMember,
    updateMemberRole,
    swapMemberRoles,
    updateMemberDisplayName,
    ensureSelfProfile,
    updateSelfDisplayName,
    memberQuota,
  };
}
