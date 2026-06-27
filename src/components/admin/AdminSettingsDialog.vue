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
        <div v-if="!profileOnly" class="flex gap-1 border-b border-gray-200 -mb-px">
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
        <div v-if="!profileOnly && activeTab === 'data'" class="space-y-3">
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
        <div v-else-if="profileOnly || activeTab === 'profile'" class="space-y-4">
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
        <div v-else-if="!profileOnly && activeTab === 'users'" class="space-y-4">
          <TenantMembersPanel
            v-if="tenantId"
            :tenant-id="tenantId"
            :owner-uid="ownerUid"
            :hint="tenantMembersHint"
            id-prefix="admin-settings-members"
            @updated="onMembersUpdated"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useAuth } from '@/composables/useAuth';
import { useTenant } from '@/composables/useTenant';
import { useTenantAccess } from '@/composables/useTenantAccess';
import { useTenantUsers } from '@/composables/useTenantUsers';
import { useCapsLockHint } from '@/composables/useCapsLockHint';
import { setPostLogoutNotice } from '@/lib/logoutNotices';
import TenantMembersPanel from '@/components/admin/TenantMembersPanel.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  profileOnly: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'import-csv', 'export-csv', 'empty-guests', 'password-changed']);

const tabs = [
  { id: 'data', label: '資料管理' },
  { id: 'profile', label: '我的帳號' },
  { id: 'users', label: '用戶管理' },
];

const tenantMembersHint =
  '管理可登入此婚宴專案的帳號。Owner 可點「編輯」修改顯示名稱、角色或移除用戶。\n'
  + '如需重設用戶密碼請WhatsApp聯絡系統管理員。';

const activeTab = ref('data');

const { user, changePassword, logout } = useAuth();
const { memberRole } = useTenantAccess();
const { meta, tenantId } = useTenant();
const ownerUid = computed(() => meta.value?.owner_uid || '');
const {
  members,
  loadMembers,
  ensureSelfProfile,
  updateSelfDisplayName,
} = useTenantUsers();
const roleLabel = computed(() => {
  if (memberRole.value === 'platform_admin') return 'Super Admin';
  if (memberRole.value === 'reception') return '現場接待';
  return '後台管理員';
});
const { showCapsLockHint, passwordInputHandlers } = useCapsLockHint();

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

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return;
    activeTab.value = props.profileOnly ? 'profile' : 'data';
    pwMsg.value = '';
    nameMsg.value = '';
    editingName.value = false;
    try {
      await ensureSelfProfile();
      await syncProfileDisplayName();
    } catch {
      /* errors shown in UI */
    }
  },
);

watch(activeTab, async (tab) => {
  if (tab !== 'profile' || !props.open) return;
  try {
    await syncProfileDisplayName();
  } catch {
    /* errors shown in UI */
  }
});

async function syncProfileDisplayName(sourceMembers) {
  if (!sourceMembers) {
    await loadMembers();
  }
  const list = sourceMembers || members.value;
  const self = list.find((m) => m.isSelf);
  if (!self || editingName.value) return;
  displayName.value = self.displayName || '';
  originalDisplayName.value = displayName.value;
}

function onMembersUpdated(updatedMembers) {
  syncProfileDisplayName(updatedMembers);
}

function passwordErrorMessage(e) {
  const code = e?.code || '';
  const status = e?.status ?? e?.response?.status;
  const raw = String(e?.response?.message || e?.message || '');

  // PocketBase: re-authenticate 失敗通常是 "Failed to authenticate."
  if (
    code === 'auth/wrong-password' ||
    code === 'auth/invalid-credential' ||
    raw.includes('Failed to authenticate') ||
    raw.includes('Invalid login') ||
    (status === 400 && raw)
  ) {
    return '目前密碼不正確';
  }
  if (code === 'auth/weak-password') {
    return '新密碼太弱（至少 6 個字元）';
  }
  if (code === 'auth/requires-recent-login') {
    return '請重新登入後再改密碼';
  }
  return raw || '更新密碼失敗';
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
    setPostLogoutNotice('密碼已更新，請重新登入');
    if (props.profileOnly) {
      emit('close');
      emit('password-changed');
    } else {
      pwMsgOk.value = true;
      pwMsg.value = '密碼已更新，請重新登入';
    }
    await logout();
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
  cursor: not-allowed;
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
  cursor: not-allowed;
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
.quota-hint.ok {
  color: #15803d;
  font-weight: 600;
}
.add-user-hint {
  margin: 0.35rem 0 0.5rem;
  font-size: 0.75rem;
  color: #6b7280;
  line-height: 1.4;
}
</style>
