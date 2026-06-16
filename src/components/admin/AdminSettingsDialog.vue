<template>
  <div
    v-if="open"
    class="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
    @click.self="emit('close')"
  >
    <div class="bg-white rounded-xl shadow-xl max-w-lg w-full border border-gray-100 max-h-[90vh] flex flex-col">
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
              <dt>權限</dt>
              <dd><span class="badge">後台管理員</span></dd>
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
        <div v-else-if="activeTab === 'users'" class="space-y-4">
          <p class="hint">
            管理可登入此婚宴後台的帳號。新增用戶會建立 Firebase 登入帳號並授予後台權限。
          </p>
          <p v-if="!isOwner" class="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-2">
            你而家係一般後台用戶（非 Owner），只能查看用戶清單；如要新增／移除用戶，請用 Owner 帳號登入。
          </p>

          <p v-if="usersLoading" class="text-xs text-gray-400">⏳ 載入用戶清單…</p>
          <p v-else-if="usersError" class="msg-error">{{ usersError }}</p>

          <ul v-else-if="members.length" class="member-list">
            <li v-for="m in members" :key="m.uid" class="member-item">
              <div class="member-main">
                <span class="member-email">{{ m.email || m.uid }}</span>
                <span v-if="m.displayName" class="member-name">{{ m.displayName }}</span>
                <span v-if="m.uid === ownerUid" class="member-owner">（Owner）</span>
                <span v-else-if="m.role === 'reception'" class="member-role">（現場接待）</span>
                <span v-else-if="m.role === 'admin'" class="member-role">（後台管理員）</span>
                <span v-else-if="m.isSelf" class="member-self">（你）</span>
              </div>
              <button
                v-if="!m.isSelf && m.uid !== ownerUid"
                type="button"
                class="btn-remove"
                :disabled="removingUid === m.uid"
                @click="confirmRemove(m)"
              >
                {{ removingUid === m.uid ? '移除中…' : '移除' }}
              </button>
            </li>
          </ul>
          <p v-else class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
            尚未有用戶資料。如你係平台管理員手動開嘅帳號，可能只顯示 UID。
          </p>

          <template v-if="isOwner">
            <form class="add-user-form" @submit.prevent="submitAddUser">
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
              <div class="field">
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
                <select id="new-user-role" v-model="newUserRole" class="w-full border border-gray-300 rounded-lg p-2 text-sm">
                  <option value="admin">後台管理員</option>
                  <option value="reception">現場接待</option>
                </select>
              </div>
              <p v-if="addUserMsg" :class="addUserMsgOk ? 'msg-ok' : 'msg-error'">{{ addUserMsg }}</p>
              <button type="submit" class="btn-primary" :disabled="addingUser">
                {{ addingUser ? '建立中…' : '建立用戶' }}
              </button>
            </form>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useAuth } from '@/composables/useAuth';
import { useTenant } from '@/composables/useTenant';
import { useTenantUsers } from '@/composables/useTenantUsers';
import { useCapsLockHint } from '@/composables/useCapsLockHint';

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
const { meta } = useTenant();
const ownerUid = computed(() => meta.value?.owner_uid || '');
const isOwner = computed(() => !ownerUid.value || ownerUid.value === user.value?.uid);
const {
  members,
  loading: usersLoading,
  error: usersError,
  loadMembers,
  createMember,
  removeMember,
  ensureSelfProfile,
} = useTenantUsers();
const { showCapsLockHint, passwordInputHandlers } = useCapsLockHint();

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const changingPw = ref(false);
const pwMsg = ref('');
const pwMsgOk = ref(false);

const newUserEmail = ref('');
const newUserName = ref('');
const newUserPassword = ref('');
const newUserRole = ref('admin');
const addingUser = ref(false);
const addUserMsg = ref('');
const addUserMsgOk = ref(false);
const removingUid = ref('');

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return;
    activeTab.value = 'data';
    pwMsg.value = '';
    addUserMsg.value = '';
    try {
      await ensureSelfProfile();
      await loadMembers();
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

async function submitAddUser() {
  addUserMsg.value = '';
  addUserMsgOk.value = false;
  if (!isOwner.value) {
    addUserMsgOk.value = false;
    addUserMsg.value = '只有 owner 可以新增用戶';
    return;
  }
  addingUser.value = true;
  try {
    await createMember({
      email: newUserEmail.value,
      password: newUserPassword.value,
      displayName: newUserName.value,
      role: newUserRole.value,
    });
    newUserEmail.value = '';
    newUserName.value = '';
    newUserPassword.value = '';
    newUserRole.value = 'admin';
    addUserMsgOk.value = true;
    addUserMsg.value = '用戶已建立並加入後台權限';
  } catch (e) {
    addUserMsgOk.value = false;
    addUserMsg.value = e?.message || '建立用戶失敗';
  } finally {
    addingUser.value = false;
  }
}

async function confirmRemove(member) {
  if (!isOwner.value) {
    addUserMsgOk.value = false;
    addUserMsg.value = '只有 owner 可以移除用戶';
    return;
  }
  const label = member.email || member.uid;
  const ok = window.confirm(`確定要移除「${label}」的後台權限嗎？\n\n對方將無法再登入此婚宴後台（Firebase 帳號仍會保留）。`);
  if (!ok) return;

  removingUid.value = member.uid;
  addUserMsg.value = '';
  try {
    await removeMember(member.uid);
    addUserMsgOk.value = true;
    addUserMsg.value = '已移除用戶權限';
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
.member-list {
  list-style: none;
  margin: 0 0 1rem;
  padding: 0;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  overflow: hidden;
}
.member-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.55rem 0.65rem;
  font-size: 0.8rem;
  border-bottom: 1px solid #f3f4f6;
}
.member-item:last-child {
  border-bottom: none;
}
.member-main {
  min-width: 0;
  flex: 1;
}
.member-email {
  display: block;
  font-weight: 700;
  color: #111827;
  word-break: break-all;
}
.member-name {
  display: block;
  font-size: 0.7rem;
  color: #6b7280;
}
.member-self {
  font-size: 0.7rem;
  color: #b91c1c;
  font-weight: 700;
}
.member-owner {
  font-size: 0.7rem;
  color: #1d4ed8;
  font-weight: 800;
}
.member-role {
  font-size: 0.7rem;
  color: #374151;
  font-weight: 700;
}
.btn-remove {
  flex-shrink: 0;
  padding: 0.25rem 0.5rem;
  font-size: 0.7rem;
  font-weight: 700;
  color: #dc2626;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 0.35rem;
  cursor: pointer;
}
.btn-remove:disabled {
  opacity: 0.6;
  cursor: wait;
}
</style>
