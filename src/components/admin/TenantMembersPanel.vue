<template>
  <div class="tenant-members-panel" @click="closeMemberMenu">
    <p v-if="showViewerHint && !canManageUsers" class="viewer-hint">
      你而家係一般後台用戶（非 Owner），只能查看用戶清單；如要新增／移除用戶，請用 Owner 帳號登入。
    </p>
    <p v-else-if="hint" class="panel-hint">{{ hint }}</p>

    <p v-if="usersLoading" class="muted">⏳ 載入用戶清單…</p>
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
              <span v-else class="no-action">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="muted">尚未有用戶。</p>

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
        <p v-else-if="isPlatformAdmin" class="quota-hint ok">
          你係 Super Admin，可超出配額新增或調整用戶。
        </p>
      </div>

      <form v-if="isPlatformAdmin || hasAddableRole" class="add-user-form" @submit.prevent="submitAddUser">
        <h4 class="section-title">➕ 新增用戶</h4>
        <div class="add-user-grid">
          <div class="field">
            <label :for="emailInputId">Email</label>
            <input
              :id="emailInputId"
              v-model="newUserEmail"
              type="email"
              required
              autocomplete="off"
              placeholder="coordinator@example.com"
            />
          </div>
          <div class="field">
            <label :for="nameInputId">顯示名稱（選填）</label>
            <input
              :id="nameInputId"
              v-model="newUserName"
              type="text"
              autocomplete="off"
              placeholder="例如：統籌 Amy"
            />
          </div>
          <p
            v-if="addUserEmailChecking || addUserEmailHint"
            class="email-check-hint field-span-2"
            :class="addUserEmailChecking ? 'checking' : addUserEmailStatus"
          >
            {{ addUserEmailChecking ? '檢查 Email…' : addUserEmailHint }}
          </p>
          <div v-if="!addUserEmailReuse" class="field">
            <label :for="pwInputId">密碼</label>
            <input
              :id="pwInputId"
              v-model="newUserPassword"
              type="password"
              required
              minlength="6"
              autocomplete="new-password"
              v-on="passwordInputHandlers"
            />
          </div>
          <div class="field" :class="{ 'field-span-2': addUserEmailReuse }">
            <label :for="roleInputId">角色</label>
            <select :id="roleInputId" v-model="newUserRole" class="role-select">
              <option v-if="canAddRole('admin')" value="admin">
                後台管理員 — 可進入後台管理賓客、排位、CSV{{ roleQuotaSuffix('admin') }}
              </option>
              <option v-if="canAddRole('reception')" value="reception">
                現場接待 — 點名、取消賓客、現場加座，不能進入後台{{ roleQuotaSuffix('reception') }}
              </option>
            </select>
          </div>
        </div>
        <p v-if="addUserMsg" :class="addUserMsgOk ? 'msg-ok' : 'msg-error'">{{ addUserMsg }}</p>
        <p v-else-if="!canSubmitAddUser && addUserBlockReason" class="add-user-hint">
          {{ addUserBlockReason }}
        </p>
        <button
          type="submit"
          class="btn-primary"
          :class="{ 'btn-primary-muted': addUserEmailStatus === 'member' }"
          :disabled="addingUser || !canSubmitAddUser"
          :title="addUserBlockReason || undefined"
        >
          {{ addingUser ? '建立中…' : '建立用戶' }}
        </button>
      </form>
      <p v-else class="quota-hint warn">
        合計名額已滿，無法新增用戶；仍可用「編輯」調整或交換現有成員角色。
      </p>
    </template>

    <p
      v-if="userToast"
      class="panel-toast"
      role="status"
      aria-live="polite"
    >
      {{ userToast }}
    </p>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref, toRef, watch } from 'vue';
import { usePlatformAdmin } from '@/composables/usePlatformAdmin';
import { useTenantAccess } from '@/composables/useTenantAccess';
import { useTenantUsers } from '@/composables/useTenantUsers';
import { useMemberEmailCheck } from '@/composables/useMemberEmailCheck';
import { useCapsLockHint } from '@/composables/useCapsLockHint';
import {
  canAddMemberRole,
  canChangeMemberToRole,
  getMemberQuota,
  getSwapRoleCandidates,
  hasAddableMemberRole,
  hasRoleChangeOptions,
} from '@/lib/tenantMemberLimits';

const props = defineProps({
  tenantId: { type: String, required: true },
  ownerUid: { type: String, default: '' },
  hint: { type: String, default: '' },
  showViewerHint: { type: Boolean, default: true },
  idPrefix: { type: String, default: 'tenant-members' },
});

const emit = defineEmits(['updated']);

const { isPlatformAdmin } = usePlatformAdmin();
const { memberRole } = useTenantAccess();
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
} = useTenantUsers({
  tenantId: toRef(props, 'tenantId'),
  ownerUid: toRef(props, 'ownerUid'),
});

const isOwner = computed(() => {
  if (isPlatformAdmin.value) return true;
  if (memberRole.value === 'owner') return true;
  return false;
});
const canManageUsers = computed(() => isPlatformAdmin.value || isOwner.value);

const quota = computed(() => getMemberQuota(members.value, props.ownerUid));

const hasAddableRole = computed(() => hasAddableMemberRole(
  members.value,
  props.ownerUid,
  { bypassLimits: isPlatformAdmin.value },
));

function canAddRole(role) {
  return canAddMemberRole(
    members.value,
    props.ownerUid,
    role,
    { bypassLimits: isPlatformAdmin.value },
  );
}

function roleQuotaSuffix(role) {
  if (isPlatformAdmin.value) return '（Super Admin 可超出配額）';
  const n = role === 'admin' ? quota.value.remaining.admin : quota.value.remaining.reception;
  return `（剩餘 ${n} 個）`;
}

const emailInputId = computed(() => `${props.idPrefix}-email`);
const nameInputId = computed(() => `${props.idPrefix}-name`);
const pwInputId = computed(() => `${props.idPrefix}-pw`);
const roleInputId = computed(() => `${props.idPrefix}-role`);

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
} = useMemberEmailCheck(newUserEmail, { tenantId: toRef(props, 'tenantId') });

const { passwordInputHandlers } = useCapsLockHint();

const addingUser = ref(false);

const addUserBlockReason = computed(() => {
  if (addingUser.value) return '';
  if (!canAddRole(newUserRole.value)) {
    return isPlatformAdmin.value
      ? '所選角色無效'
      : '所選角色名額已滿，請選擇其他角色';
  }
  if (!newUserEmail.value.trim()) return '請輸入 Email';
  if (addUserEmailChecking.value) return '正在檢查 Email…';
  if (addUserEmailBlocking.value) return addUserEmailHint.value || '此 Email 無法使用';
  if (!addUserEmailCanProceed.value) return '請輸入有效 Email 並等待檢查完成';
  if (!addUserEmailReuse.value && newUserPassword.value.trim().length < 6) {
    return '請輸入至少 6 字元的密碼';
  }
  return '';
});

const canSubmitAddUser = computed(() => !addUserBlockReason.value);

const addUserMsg = ref('');
const addUserMsgOk = ref(false);
const removingUid = ref('');
const roleChangingUid = ref('');
const nameSavingUid = ref('');
const openMenuUid = ref(null);
const memberEditPanel = ref(null);
const userToast = ref('');
let userToastTimer = null;

function notifyUpdated() {
  emit('updated', members.value);
}

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
    notifyUpdated();
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
    notifyUpdated();
  } catch (e) {
    addUserMsgOk.value = false;
    addUserMsg.value = e?.message || '變更角色失敗';
  } finally {
    roleChangingUid.value = '';
  }
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
    notifyUpdated();
  } catch (e) {
    addUserMsgOk.value = false;
    addUserMsg.value = e?.message || '交換角色失敗';
  } finally {
    roleChangingUid.value = '';
  }
}

function removeFromMenu(member) {
  closeMemberMenu();
  confirmRemove(member);
}

async function confirmRemove(member) {
  const label = member.email || member.uid;
  const ok = window.confirm(
    `確定要移除「${label}」嗎？\n\n對方將無法再登入此婚宴後台。若該帳號沒有加入其他專案，登入帳號亦會一併刪除。`,
  );
  if (!ok) return;
  removingUid.value = member.uid;
  addUserMsg.value = '';
  try {
    await removeMember(member.uid);
    showUserToast(`已移除「${label}」`);
    notifyUpdated();
  } catch (e) {
    addUserMsgOk.value = false;
    addUserMsg.value = e?.message || '移除用戶失敗';
  } finally {
    removingUid.value = '';
  }
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
    addUserMsg.value = addUserBlockReason.value || '請填寫完整資料後再建立';
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
    notifyUpdated();
  } catch (e) {
    addUserMsgOk.value = false;
    addUserMsg.value = e?.message || '建立用戶失敗';
  } finally {
    addingUser.value = false;
  }
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

watch(
  () => props.tenantId,
  async (id) => {
    if (!id) return;
    closeMemberMenu();
    closeMemberEdit();
    await loadMembers();
    notifyUpdated();
  },
  { immediate: true },
);

defineExpose({ members, loadMembers });
</script>

<style scoped>
.tenant-members-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.panel-hint,
.viewer-hint {
  font-size: 0.8rem;
  color: #64748b;
  margin: 0;
  line-height: 1.5;
}
.viewer-hint {
  color: #1d4ed8;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 0.5rem;
  padding: 0.5rem 0.65rem;
}
.muted {
  color: #94a3b8;
  font-size: 0.8rem;
  margin: 0;
}
.no-action {
  color: #d1d5db;
}
.member-table-wrap {
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
.actions-col {
  width: 5rem;
  text-align: center;
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
  display: block;
  margin-top: 0.15rem;
  font-weight: 500;
  color: #6b7280;
}
.member-edit-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}
.member-edit-input {
  flex: 1;
  min-width: 10rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  padding: 0.4rem 0.5rem;
  font-size: 0.8125rem;
}
.btn-mini {
  padding: 0.35rem 0.6rem;
  font-size: 0.75rem;
  font-weight: 700;
  border: 1px solid #d1d5db;
  border-radius: 0.35rem;
  background: #fff;
  cursor: pointer;
}
.btn-mini.primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}
.btn-mini:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.quota-summary {
  padding: 0.65rem 0.75rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
}
.quota-title {
  margin: 0 0 0.35rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: #475569;
}
.quota-list {
  margin: 0;
  padding: 0;
  list-style: none;
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
.quota-hint.ok {
  color: #15803d;
  font-weight: 600;
}
.section-title {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: #374151;
}
.add-user-form {
  margin-top: 0.25rem;
}
.add-user-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
  align-items: start;
}
.add-user-grid .field {
  margin-bottom: 0;
}
.field-span-2 {
  grid-column: 1 / -1;
}
@media (max-width: 640px) {
  .add-user-grid {
    grid-template-columns: 1fr;
  }
  .field-span-2 {
    grid-column: auto;
  }
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
.field input,
.role-select {
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
.add-user-hint {
  margin: 0.35rem 0 0.5rem;
  font-size: 0.75rem;
  color: #6b7280;
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
  cursor: not-allowed;
}
.btn-primary-muted:disabled {
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
.panel-toast {
  position: fixed;
  bottom: 1.25rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10001;
  margin: 0;
  padding: 0.55rem 1rem;
  border-radius: 0.5rem;
  background: #111827;
  color: #fff;
  font-size: 0.8rem;
  font-weight: 600;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}
</style>
