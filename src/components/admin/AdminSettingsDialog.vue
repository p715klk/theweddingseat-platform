<template>
  <div
    v-if="open"
    class="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
    @click.self="emit('close')"
  >
    <div class="bg-white rounded-xl shadow-xl max-w-2xl w-full border border-gray-100 max-h-[90vh] flex flex-col">
      <div class="p-4 border-b border-gray-100 flex-shrink-0">
        <div class="flex items-center justify-between gap-2 mb-3">
          <h3 class="text-base font-bold text-gray-900">⚙ 設定</h3>
          <button
            type="button"
            class="text-gray-400 hover:text-gray-600 text-lg leading-none px-1"
            aria-label="關閉"
            @click="emit('close')"
          >
            ×
          </button>
        </div>
        <div class="flex gap-1 border-b border-gray-200 -mb-px">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            class="settings-tab"
            :class="{ active: activeTab === tab.id }"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <div class="p-4 overflow-y-auto flex-1 min-h-0">
        <!-- 資料管理 -->
        <div v-if="activeTab === 'data'" class="space-y-3">
          <p class="text-xs text-gray-500 leading-relaxed">
            匯入／匯出賓客名單，或清空所有賓客。修改後需按「儲存變更」才會同步。
          </p>
          <button type="button" class="settings-action-btn" @click="emit('import-csv')">
            📥 匯入 CSV
          </button>
          <button type="button" class="settings-action-btn" @click="emit('export-csv')">
            📤 匯出 CSV
          </button>
          <button type="button" class="settings-action-btn danger" @click="emit('empty-guests')">
            🗑 清空所有賓客
          </button>
        </div>

        <!-- 我的帳號 -->
        <div v-else-if="activeTab === 'profile'" class="space-y-4">
          <dl class="profile-info">
            <div class="profile-row">
              <dt>Email</dt>
              <dd>{{ user?.email || '—' }}</dd>
            </div>
            <div class="profile-row">
              <dt>顯示名稱</dt>
              <dd>
                <div class="profile-edit-row">
                  <span v-if="!editingName">{{ displayName || '—' }}</span>
                  <form v-else class="profile-edit-form" @submit.prevent="submitDisplayName">
                    <input
                      v-model="displayName"
                      type="text"
                      maxlength="40"
                      placeholder="例如：統籌 Amy"
                      :disabled="savingName"
                    />
                    <button type="submit" class="btn-mini primary" :disabled="savingName">
                      {{ savingName ? '儲存中…' : '儲存' }}
                    </button>
                    <button type="button" class="btn-mini" :disabled="savingName" @click="cancelEditName">
                      取消
                    </button>
                  </form>

                  <button
                    v-if="!editingName"
                    type="button"
                    class="btn-mini"
                    @click="startEditName"
                  >
                    修改
                  </button>
                </div>
                <p v-if="nameMsg" :class="nameMsgOk ? 'msg-ok' : 'msg-error'">{{ nameMsg }}</p>
              </dd>
            </div>
            <div class="profile-row">
              <dt>權限</dt>
              <dd><span class="badge">{{ roleLabel }}</span></dd>
            </div>
          </dl>

          <div>
            <h4 class="section-title">更改密碼</h4>
            <p class="hint">更改前需輸入目前密碼以確認身份。</p>
            <form class="pw-form" @submit.prevent="submitPassword">
              <div class="field">
                <label for="admin-current-pw">目前密碼</label>
                <input
                  id="admin-current-pw"
                  v-model="currentPassword"
                  type="password"
                  required
                  autocomplete="current-password"
                  v-on="passwordInputHandlers"
                />
              </div>
              <div class="field">
                <label for="admin-new-pw">新密碼</label>
                <input
                  id="admin-new-pw"
                  v-model="newPassword"
                  type="password"
                  required
                  minlength="6"
                  autocomplete="new-password"
                  v-on="passwordInputHandlers"
                />
              </div>
              <div class="field">
                <label for="admin-confirm-pw">確認新密碼</label>
                <input
                  id="admin-confirm-pw"
                  v-model="confirmPassword"
                  type="password"
                  required
                  minlength="6"
                  autocomplete="new-password"
                  v-on="passwordInputHandlers"
                />
              </div>
              <p v-if="showCapsLockHint" class="caps-hint">Caps Lock 已開啟</p>
              <p v-if="pwMsg" :class="pwMsgOk ? 'msg-ok' : 'msg-error'">{{ pwMsg }}</p>
              <button type="submit" class="btn-primary" :disabled="changingPw">
                {{ changingPw ? '更新中…' : '🔒 更新密碼' }}
              </button>
            </form>
          </div>
        </div>

        <!-- 用戶管理 -->
        <div v-else-if="activeTab === 'users'" class="space-y-4" @click="closeMemberMenu">
          <p class="hint">
            管理可登入此婚宴專案的帳號。Owner 可點「編輯」修改顯示名稱、角色或移除用戶。
          </p>
          <p v-if="!canManageUsers" class="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-2">
            你而家係一般後台用戶（非 Owner），只能查看用戶清單；如要新增／移除用戶，請用 Owner 帳號登入。
          </p>

          <p v-if="usersLoading" class="text-xs text-gray-400">⏳ 載入用戶清單…</p>
          <p v-else-if="usersError" class="msg-error">{{ usersError }}</p>

          <div v-else-if="members.length" class="member-table-wrap">
            <table class="member-table">
              <thead>
                <tr>
                  <th>顯示名稱</th>
                  <th>登入 Email</th>
                  <th>角色</th>
                  <th class="actions-col">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="m in members" :key="m.uid">
                  <td>
                    <span class="member-name-cell">{{ m.displayName || '—' }}</span>
                    <span v-if="m.isSelf" class="member-self-tag">你</span>
                  </td>
                  <td class="member-email-cell">{{ m.email || m.uid }}</td>
                  <td>
                    <span class="role-label">{{ memberRoleLabel(m.role) }}</span>
                  </td>
                  <td class="actions-cell" @click.stop>
                    <div v-if="canManageUsers" class="actions-wrap">
                      <button
                        type="button"
                        class="btn-member-edit"
                        :class="{ open: openMenuUid === m.uid }"
                        aria-haspopup="menu"
                        :aria-expanded="openMenuUid === m.uid"
                        @click="toggleMemberMenu(m.uid)"
                      >
                        編輯
                      </button>
                      <div
                        v-if="openMenuUid === m.uid"
                        class="member-actions-menu"
                        role="menu"
                        @click.stop
                      >
                        <button type="button" role="menuitem" @click="openNameEditor(m)">
                          修改顯示名稱
                        </button>
                        <template v-if="canChangeMemberRole(m)">
                          <button
                            v-if="m.role !== 'admin' && canSelectRole(m, 'admin')"
                            type="button"
                            role="menuitem"
                            :disabled="roleChangingUid === m.uid"
                            @click="pickMemberRole(m, 'admin')"
                          >
                            設為後台管理員
                          </button>
                          <button
                            v-if="m.role !== 'reception' && canSelectRole(m, 'reception')"
                            type="button"
                            role="menuitem"
                            :disabled="roleChangingUid === m.uid"
                            @click="pickMemberRole(m, 'reception')"
                          >
                            設為現場接待
                          </button>
                          <template v-if="!memberHasRoleChangeOptions(m) && swapCandidates(m).length">
                            <p class="member-menu-label">與以下用戶交換角色</p>
                            <button
                              v-for="p in swapCandidates(m)"
                              :key="p.uid"
                              type="button"
                              role="menuitem"
                              :disabled="roleChangingUid === m.uid"
                              @click="swapRolesFromMenu(m, p)"
                            >
                              與 {{ partnerLabel(p) }} 交換
                            </button>
                          </template>
                        </template>
                        <button
                          v-if="canRemoveMember(m)"
                          type="button"
                          role="menuitem"
                          class="danger"
                          :disabled="removingUid === m.uid"
                          @click="removeFromMenu(m)"
                        >
                          {{ removingUid === m.uid ? '移除中…' : '移除用戶' }}
                        </button>
                      </div>
                    </div>
                    <span v-else class="text-gray-300">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="memberEditPanel" class="member-edit-panel" @click.stop>
            <form class="member-edit-form" @submit.prevent="submitMemberNameEdit">
              <p class="member-edit-label">
                修改顯示名稱
                <span class="member-edit-email">{{ memberEditPanel.email }}</span>
              </p>
              <div class="member-edit-row">
                <input
                  v-model="memberEditPanel.displayName"
                  type="text"
                  maxlength="40"
                  class="member-edit-input"
                  placeholder="例如：統籌 Amy"
                  :disabled="nameSavingUid === memberEditPanel.uid"
                  autofocus
                />
                <button
                  type="submit"
                  class="btn-mini primary"
                  :disabled="nameSavingUid === memberEditPanel.uid"
                >
                  {{ nameSavingUid === memberEditPanel.uid ? '儲存中…' : '儲存' }}
                </button>
                <button
                  type="button"
                  class="btn-mini"
                  :disabled="nameSavingUid === memberEditPanel.uid"
                  @click="closeMemberEdit"
                >
                  取消
                </button>
              </div>
            </form>
          </div>

          <template v-if="canManageUsers">
            <div class="quota-summary">
              <p class="quota-title">帳戶配額</p>
              <ul class="quota-list">
                <li>
                  Owner：
                  <strong :class="{ 'quota-over': quota.counts.owner > quota.limits.owner }">
                    {{ quota.counts.owner }}/{{ quota.limits.owner }}
                  </strong>
                </li>
                <li>
                  後台管理員：
                  <strong :class="{ 'quota-over': quota.counts.admin > quota.limits.admin }">
                    {{ quota.counts.admin }}/{{ quota.limits.admin }}
                  </strong>
                </li>
                <li>
                  現場接待：
                  <strong :class="{ 'quota-over': quota.counts.reception > quota.limits.reception }">
                    {{ quota.counts.reception }}/{{ quota.limits.reception }}
                  </strong>
                </li>
                <li>
                  合計：
                  <strong :class="{ 'quota-over': quota.counts.total > quota.limits.total }">
                    {{ quota.counts.total }}/{{ quota.limits.total }}
                  </strong>
                </li>
              </ul>
              <p
                v-if="!isPlatformAdmin && quota.counts.admin > quota.limits.admin"
                class="quota-hint warn"
              >
                後台管理員已超出上限，請移除多餘用戶或調整角色後再新增。
              </p>
            </div>

            <form v-if="isPlatformAdmin || hasAddableRole" class="add-user-form" @submit.prevent="submitAddUser">
              <h4 class="section-title">➕ 新增用戶</h4>
              <div class="field">
                <label for="new-user-email">Email</label>
                <input
                  id="new-user-email"
                  v-model="newUserEmail"
                  type="email"
                  required
                  autocomplete="off"
                  placeholder="coordinator@example.com"
                />
                <p v-if="addUserEmailChecking" class="email-check-hint checking">檢查 Email…</p>
                <p v-else-if="addUserEmailHint" class="email-check-hint" :class="addUserEmailStatus">
                  {{ addUserEmailHint }}
                </p>
              </div>
              <div class="field">
                <label for="new-user-name">顯示名稱（選填）</label>
                <input
                  id="new-user-name"
                  v-model="newUserName"
                  type="text"
                  autocomplete="off"
                  placeholder="例如：統籌 Amy"
                />
              </div>
              <div v-if="!addUserEmailReuse" class="field">
                <label for="new-user-pw">初始密碼</label>
                <input
                  id="new-user-pw"
                  v-model="newUserPassword"
                  type="password"
                  required
                  minlength="6"
                  autocomplete="new-password"
                  v-on="passwordInputHandlers"
                />
              </div>
              <div class="field">
                <label for="new-user-role">角色</label>
                <select
                  id="new-user-role"
                  v-model="newUserRole"
                  class="w-full border border-gray-300 rounded-lg p-2 text-sm"
                >
                  <option v-if="canAddRole('admin')" value="admin">
                    後台管理員 — 可進入後台管理賓客、排位、CSV（剩餘 {{ quota.remaining.admin }} 個）
                  </option>
                  <option v-if="canAddRole('reception')" value="reception">
                    現場接待 — 點名、取消賓客、現場加座，不能進入後台（剩餘 {{ quota.remaining.reception }} 個）
                  </option>
                </select>
              </div>
              <p v-if="addUserMsg" :class="addUserMsgOk ? 'msg-ok' : 'msg-error'">{{ addUserMsg }}</p>
              <button
                type="submit"
                class="btn-primary"
                :class="{ 'btn-primary-muted': addUserEmailStatus === 'member' }"
                :disabled="addingUser || !canSubmitAddUser"
              >
                {{ addingUser ? '建立中…' : '建立用戶' }}
              </button>
            </form>
            <p v-else class="quota-hint warn">
              合計名額已滿，無法新增用戶；仍可用「編輯」調整或交換現有成員角色。
            </p>
          </template>
        </div>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <p
      v-if="userToast"
      class="admin-toast is-visible"
      role="status"
      aria-live="polite"
    >
      {{ userToast }}
    </p>
  </Teleport>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue';
import { useAuth } from '@/composables/useAuth';
import { useTenant } from '@/composables/useTenant';
import { usePlatformAdmin } from '@/composables/usePlatformAdmin';
import { useTenantAccess } from '@/composables/useTenantAccess';
import { useTenantUsers } from '@/composables/useTenantUsers';
import { useMemberEmailCheck } from '@/composables/useMemberEmailCheck';
import { useCapsLockHint } from '@/composables/useCapsLockHint';
import { canAddMemberRole, canChangeMemberToRole, getMemberQuota, getSwapRoleCandidates, hasAddableMemberRole, hasRoleChangeOptions } from '@/lib/tenantMemberLimits';

const props = defineProps({
  open: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'import-csv', 'export-csv', 'empty-guests']);

const tabs = [
  { id: 'data', label: '資料管理' },
  { id: 'profile', label: '我的帳號' },
  { id: 'users', label: '用戶管理' },
];

const activeTab = ref('data');

const { user, changePassword } = useAuth();
const { isPlatformAdmin } = usePlatformAdmin();
const { memberRole } = useTenantAccess();
const { meta, tenantId } = useTenant();
const ownerUid = computed(() => meta.value?.owner_uid || '');
const {
  members,
  loading: usersLoading,
  error: usersError,
  loadMembers,
  createMember,
  removeMember,
  updateMemberRole,
  swapMemberRoles,
  updateMemberDisplayName,
  ensureSelfProfile,
  updateSelfDisplayName,
} = useTenantUsers();
const isOwner = computed(() => {
  const self = members.value.find((m) => m.isSelf);
  if (self?.role === 'owner') return true;
  return !!ownerUid.value && ownerUid.value === user.value?.uid;
});
const canManageUsers = computed(() => isPlatformAdmin.value || isOwner.value);
const roleLabel = computed(() => {
  if (memberRole.value === 'platform_admin') return 'Super Admin';
  if (memberRole.value === 'reception') return '現場接待';
  return '後台管理員';
});
const { showCapsLockHint, passwordInputHandlers } = useCapsLockHint();

const quota = computed(() => getMemberQuota(members.value, ownerUid.value));

const hasAddableRole = computed(() => hasAddableMemberRole(
  members.value,
  ownerUid.value,
  { bypassLimits: isPlatformAdmin.value },
));

function canAddRole(role) {
  return canAddMemberRole(
    members.value,
    ownerUid.value,
    role,
    { bypassLimits: isPlatformAdmin.value },
  );
}

watch(
  () => [
    quota.value.remaining.admin,
    quota.value.remaining.reception,
    quota.value.remaining.total,
    members.value.length,
  ],
  () => {
    if (isPlatformAdmin.value) return;
    if (!canAddRole(newUserRole.value)) {
      if (canAddRole('admin')) newUserRole.value = 'admin';
      else if (canAddRole('reception')) newUserRole.value = 'reception';
    }
  },
);

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const changingPw = ref(false);
const pwMsg = ref('');
const pwMsgOk = ref(false);

const displayName = ref('');
const savingName = ref(false);
const nameMsg = ref('');
const nameMsgOk = ref(false);
const editingName = ref(false);
const originalDisplayName = ref('');

const newUserEmail = ref('');
const newUserName = ref('');
const newUserPassword = ref('');
const newUserRole = ref('admin');

const {
  status: addUserEmailStatus,
  hint: addUserEmailHint,
  canProceed: addUserEmailCanProceed,
  isBlocking: addUserEmailBlocking,
  isChecking: addUserEmailChecking,
  isReuse: addUserEmailReuse,
} = useMemberEmailCheck(newUserEmail, { tenantId });

const canSubmitAddUser = computed(() => {
  if (!canAddRole(newUserRole.value)) return false;
  if (!newUserEmail.value.trim()) return false;
  if (addUserEmailChecking.value || addUserEmailBlocking.value) return false;
  if (!addUserEmailCanProceed.value) return false;
  if (!addUserEmailReuse.value && newUserPassword.value.trim().length < 6) return false;
  return true;
});

const addingUser = ref(false);
const addUserMsg = ref('');
const addUserMsgOk = ref(false);
const removingUid = ref('');
const roleChangingUid = ref('');
const nameSavingUid = ref('');
const openMenuUid = ref(null);
const memberEditPanel = ref(null);
const userToast = ref('');
let userToastTimer = null;

function showUserToast(message, ms = 2500) {
  userToast.value = message;
  clearTimeout(userToastTimer);
  userToastTimer = setTimeout(() => {
    userToast.value = '';
  }, ms);
}

onUnmounted(() => {
  clearTimeout(userToastTimer);
});

function memberRoleLabel(role) {
  if (role === 'owner') return 'Owner';
  if (role === 'reception') return '現場接待';
  if (role === 'admin') return '後台管理員';
  return '—';
}

function canSelectRole(member, targetRole) {
  return canChangeMemberToRole(
    members.value,
    member.uid,
    targetRole,
    { bypassLimits: isPlatformAdmin.value },
  );
}

function memberHasRoleChangeOptions(member) {
  return hasRoleChangeOptions(
    members.value,
    member.uid,
    { bypassLimits: isPlatformAdmin.value },
  );
}

function swapCandidates(member) {
  return getSwapRoleCandidates(members.value, member.uid);
}

function partnerLabel(partner) {
  const name = partner.displayName || partner.email || partner.uid;
  return `${name}（${memberRoleLabel(partner.role)}）`;
}

async function swapRolesFromMenu(member, partner) {
  closeMemberMenu();
  roleChangingUid.value = member.uid;
  addUserMsg.value = '';
  try {
    await swapMemberRoles(member.uid, partner.uid);
    showUserToast(
      `已將「${member.email || member.uid}」與「${partner.email || partner.uid}」交換角色`,
    );
  } catch (e) {
    addUserMsgOk.value = false;
    addUserMsg.value = e?.message || '交換角色失敗';
  } finally {
    roleChangingUid.value = '';
  }
}

function canChangeMemberRole(member) {
  return !member.isSelf && member.role !== 'owner';
}

function canRemoveMember(member) {
  return !member.isSelf && member.role !== 'owner';
}

function toggleMemberMenu(uid) {
  openMenuUid.value = openMenuUid.value === uid ? null : uid;
}

function closeMemberMenu() {
  openMenuUid.value = null;
}

function openNameEditor(member) {
  closeMemberMenu();
  memberEditPanel.value = {
    uid: member.uid,
    email: member.email || member.uid,
    displayName: member.displayName || '',
  };
}

function closeMemberEdit() {
  memberEditPanel.value = null;
}

async function submitMemberNameEdit() {
  if (!memberEditPanel.value) return;
  const { uid, email, displayName } = memberEditPanel.value;
  const raw = String(displayName || '').trim();
  const member = members.value.find((m) => m.uid === uid);
  const prev = member?.displayName || '';
  if (raw === prev) {
    closeMemberEdit();
    return;
  }
  if (raw.length > 40) {
    addUserMsgOk.value = false;
    addUserMsg.value = '顯示名稱太長（最多 40 字）';
    return;
  }

  nameSavingUid.value = uid;
  addUserMsg.value = '';
  try {
    await updateMemberDisplayName(uid, raw);
    closeMemberEdit();
    showUserToast(`已更新「${email}」的顯示名稱`);
  } catch (e) {
    addUserMsgOk.value = false;
    addUserMsg.value = e?.message || '更新顯示名稱失敗';
  } finally {
    nameSavingUid.value = '';
  }
}

async function pickMemberRole(member, role) {
  closeMemberMenu();
  if (member.role === role) return;

  roleChangingUid.value = member.uid;
  addUserMsg.value = '';
  try {
    await updateMemberRole(member.uid, role);
    showUserToast(`已將「${member.email || member.uid}」改為${memberRoleLabel(role)}`);
  } catch (e) {
    addUserMsgOk.value = false;
    addUserMsg.value = e?.message || '變更角色失敗';
  } finally {
    roleChangingUid.value = '';
  }
}

function removeFromMenu(member) {
  closeMemberMenu();
  confirmRemove(member);
}

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return;
    activeTab.value = 'data';
    pwMsg.value = '';
    nameMsg.value = '';
    addUserMsg.value = '';
    editingName.value = false;
    userToast.value = '';
    clearTimeout(userToastTimer);
    closeMemberMenu();
    closeMemberEdit();
    try {
      await ensureSelfProfile();
      await loadMembers();
      const self = members.value.find((m) => m.isSelf);
      displayName.value = self?.displayName || '';
      originalDisplayName.value = displayName.value;
    } catch {
      /* errors shown in UI */
    }
  },
);

watch(activeTab, async (tab) => {
  if (!props.open) return;
  if (tab === 'users') {
    await loadMembers();
  }
});

function passwordErrorMessage(e) {
  const code = e?.code || '';
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return '目前密碼錯誤';
  }
  if (code === 'auth/weak-password') {
    return '新密碼太弱（至少 6 個字元）';
  }
  if (code === 'auth/requires-recent-login') {
    return '請重新登入後再改密碼';
  }
  return e?.message || '更新密碼失敗';
}

async function submitPassword() {
  pwMsg.value = '';
  pwMsgOk.value = false;

  if (newPassword.value.length < 6) {
    pwMsg.value = '新密碼至少需要 6 個字元';
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    pwMsg.value = '兩次輸入的新密碼不一致';
    return;
  }
  if (newPassword.value === currentPassword.value) {
    pwMsg.value = '新密碼不能與目前密碼相同';
    return;
  }

  changingPw.value = true;
  try {
    await changePassword(currentPassword.value, newPassword.value);
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    pwMsgOk.value = true;
    pwMsg.value = '密碼已更新';
  } catch (e) {
    pwMsgOk.value = false;
    pwMsg.value = passwordErrorMessage(e);
  } finally {
    changingPw.value = false;
  }
}

async function submitDisplayName() {
  nameMsg.value = '';
  nameMsgOk.value = false;
  savingName.value = true;
  try {
    await updateSelfDisplayName(displayName.value);
    nameMsgOk.value = true;
    nameMsg.value = '已儲存';
    originalDisplayName.value = displayName.value;
    editingName.value = false;
  } catch (e) {
    nameMsgOk.value = false;
    nameMsg.value = e?.message || '儲存失敗';
  } finally {
    savingName.value = false;
  }
}

function startEditName() {
  nameMsg.value = '';
  nameMsgOk.value = false;
  originalDisplayName.value = displayName.value;
  editingName.value = true;
}

function cancelEditName() {
  displayName.value = originalDisplayName.value;
  editingName.value = false;
  nameMsg.value = '';
  nameMsgOk.value = false;
}

async function submitAddUser() {
  addUserMsg.value = '';
  addUserMsgOk.value = false;
  if (!canManageUsers.value) {
    addUserMsgOk.value = false;
    addUserMsg.value = '只有 owner 可以新增用戶';
    return;
  }
  if (!canSubmitAddUser.value) {
    addUserMsgOk.value = false;
    addUserMsg.value = !hasAddableRole.value
      ? '所有可新增角色名額已滿，請先移除或調整現有用戶'
      : '所選角色名額已滿，請選擇其他角色';
    return;
  }
  addingUser.value = true;
  const createdRole = newUserRole.value;
  try {
    await createMember({
      email: newUserEmail.value,
      password: newUserPassword.value,
      displayName: newUserName.value,
      role: createdRole,
      reuseExisting: addUserEmailReuse.value,
    });
    newUserEmail.value = '';
    newUserName.value = '';
    newUserPassword.value = '';
    newUserRole.value = 'admin';
    addUserMsgOk.value = true;
    addUserMsg.value = createdRole === 'reception'
      ? '用戶已建立，可登入點名頁進行現場接待'
      : '用戶已建立，可登入後台管理賓客與排位';
  } catch (e) {
    addUserMsgOk.value = false;
    addUserMsg.value = e?.message || '建立用戶失敗';
  } finally {
    addingUser.value = false;
  }
}

async function confirmRemove(member) {
  if (!canManageUsers.value) {
    addUserMsgOk.value = false;
    addUserMsg.value = '只有 owner 可以移除用戶';
    return;
  }
  const label = member.email || member.uid;
  const ok = window.confirm(
    `確定要移除「${label}」嗎？\n\n對方將無法再登入此婚宴後台。若該帳號沒有加入其他專案，登入帳號亦會一併刪除。`,
  );
  if (!ok) return;

  removingUid.value = member.uid;
  addUserMsg.value = '';
  try {
    const result = await removeMember(member.uid);
    addUserMsgOk.value = true;
    addUserMsg.value = result?.authDeleted
      ? '已移除用戶並刪除登入帳號'
      : '已移除用戶權限（登入帳號仍用於其他專案）';
  } catch (e) {
    addUserMsgOk.value = false;
    addUserMsg.value = e?.message || '移除失敗';
  } finally {
    removingUid.value = '';
  }
}
</script>

<style scoped>
.settings-tab {
  padding: 0.4rem 0.65rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: #6b7280;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.settings-tab:hover {
  color: #374151;
}
.settings-tab.active {
  color: #b91c1c;
  border-bottom-color: #b91c1c;
}
.settings-action-btn {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.6rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: #374151;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: background 0.15s;
}
.settings-action-btn:hover {
  background: #f3f4f6;
}
.settings-action-btn.danger {
  color: #dc2626;
  border-color: #fecaca;
  background: #fef2f2;
}
.settings-action-btn.danger:hover {
  background: #fee2e2;
}
.hint {
  margin: 0 0 0.75rem;
  font-size: 0.75rem;
  color: #6b7280;
  line-height: 1.5;
}
.section-title {
  margin: 0 0 0.35rem;
  font-size: 0.8125rem;
  font-weight: 700;
  color: #374151;
}
.profile-info {
  margin: 0;
}
.profile-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1rem;
  padding: 0.3rem 0;
  font-size: 0.8125rem;
}
.profile-row dt {
  min-width: 4rem;
  margin: 0;
  font-weight: 700;
  color: #6b7280;
}
.profile-row dd {
  margin: 0;
  flex: 1;
  word-break: break-all;
}
.profile-edit-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.profile-edit-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.profile-edit-form input {
  width: 100%;
  max-width: 16rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  padding: 0.45rem 0.55rem;
  font-size: 0.875rem;
}
.btn-mini {
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #1e293b;
  border-radius: 0.5rem;
  padding: 0.35rem 0.6rem;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}
.btn-mini.primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}
.btn-mini:disabled {
  opacity: 0.7;
  cursor: wait;
}
.badge {
  display: inline-block;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  background: #dcfce7;
  color: #166534;
}
.field {
  margin-bottom: 0.65rem;
}
.field label {
  display: block;
  font-size: 0.7rem;
  font-weight: 700;
  color: #4b5563;
  margin-bottom: 0.2rem;
}
.field input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  padding: 0.45rem 0.5rem;
  font-size: 0.8125rem;
}
.email-check-hint {
  margin: 0.3rem 0 0;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.4;
}
.email-check-hint.checking {
  color: #6b7280;
}
.email-check-hint.new,
.email-check-hint.reuse {
  color: #15803d;
}
.email-check-hint.member,
.email-check-hint.invalid,
.email-check-hint.error {
  color: #dc2626;
}
.pw-form,
.add-user-form {
  margin-top: 0.5rem;
}
.btn-primary {
  background: #b91c1c;
  color: #fff;
  border: none;
  border-radius: 0.5rem;
  padding: 0.45rem 0.85rem;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}
.btn-primary:disabled {
  opacity: 0.7;
  cursor: wait;
}
.btn-primary.btn-primary-muted:disabled {
  opacity: 0.52;
}
.msg-ok {
  color: #15803d;
  font-size: 0.75rem;
  margin: 0.35rem 0;
}
.msg-error {
  color: #dc2626;
  font-size: 0.75rem;
  margin: 0.35rem 0;
}
.caps-hint {
  margin: 0 0 0.5rem;
  font-size: 0.75rem;
  color: #d97706;
  font-weight: 600;
}
.member-table-wrap {
  margin: 0 0 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  overflow: visible;
}
.member-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}
.member-table th,
.member-table td {
  border-bottom: 1px solid #f3f4f6;
  padding: 0.55rem 0.65rem;
  text-align: left;
  vertical-align: middle;
}
.member-table tr:last-child td {
  border-bottom: none;
}
.member-table th {
  font-size: 0.7rem;
  font-weight: 700;
  color: #6b7280;
  background: #f9fafb;
}
.name-cell {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}
.member-name-cell {
  font-weight: 600;
  color: #111827;
}
.member-self-tag {
  margin-left: 0.35rem;
  font-size: 0.65rem;
  font-weight: 700;
  color: #b91c1c;
}
.member-email-cell {
  color: #374151;
  word-break: break-all;
}
.role-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #374151;
}
.actions-cell {
  position: relative;
  text-align: center;
}
.actions-wrap {
  position: relative;
  display: inline-block;
}
.btn-member-edit {
  padding: 0.2rem 0.55rem;
  font-size: 0.7rem;
  font-weight: 700;
  color: #374151;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.35rem;
  cursor: pointer;
}
.btn-member-edit:hover,
.btn-member-edit.open {
  background: #f1f5f9;
  border-color: #cbd5e1;
}
.member-actions-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 0.25rem);
  z-index: 20;
  min-width: 9.5rem;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}
.member-actions-menu button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.45rem 0.65rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #374151;
  background: transparent;
  border: none;
  cursor: pointer;
}
.member-actions-menu button:hover:not(:disabled) {
  background: #f8fafc;
}
.member-actions-menu button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.member-actions-menu .danger {
  color: #dc2626;
  border-top: 1px solid #f1f5f9;
}
.member-actions-menu .danger:hover:not(:disabled) {
  background: #fef2f2;
}
.member-menu-label {
  margin: 0;
  padding: 0.35rem 0.65rem 0.15rem;
  font-size: 0.6rem;
  font-weight: 700;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border-top: 1px solid #f1f5f9;
}
.member-edit-panel {
  margin: 0 0 1rem;
  padding: 0.65rem 0.75rem;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
}
.member-edit-label {
  margin: 0 0 0.45rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: #374151;
}
.member-edit-email {
  margin-left: 0.35rem;
  font-weight: 600;
  color: #6b7280;
}
.member-edit-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.member-edit-input {
  width: 10rem;
  max-width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  padding: 0.3rem 0.45rem;
  font-size: 0.75rem;
}
.member-edit-input:focus {
  outline: none;
  border-color: #b91c1c;
  box-shadow: 0 0 0 2px rgba(185, 28, 28, 0.12);
}
.actions-col {
  width: 4.5rem;
  text-align: center;
}
.quota-summary {
  margin-bottom: 0.75rem;
  padding: 0.65rem 0.75rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
}
.quota-title {
  margin: 0 0 0.35rem;
  font-size: 0.7rem;
  font-weight: 800;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.quota-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.25rem 0.75rem;
  font-size: 0.75rem;
  color: #64748b;
}
.quota-list strong {
  color: #0f172a;
}
.quota-over {
  color: #dc2626;
}
.quota-hint {
  margin: 0.35rem 0 0;
  font-size: 0.7rem;
  line-height: 1.4;
}
.quota-hint.warn {
  color: #b45309;
  font-weight: 600;
}
</style>
