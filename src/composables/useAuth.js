import { ref } from 'vue';
import getPocketBase, { isPocketBaseConfigured } from '@/lib/pocketbaseClient';

const user = ref(null);
const authReady = ref(false);
const authError = ref(null);

let authListenerAttached = false;

function mapAuthUser(record) {
  if (!record) return null;
  return {
    ...record,
    uid: record.id,
  };
}

function syncUserFromStore() {
  const pb = getPocketBase();
  user.value = mapAuthUser(pb.authStore.record);
  authReady.value = true;
}

function initAuth() {
  if (authListenerAttached) return;
  if (!isPocketBaseConfigured()) {
    authError.value =
      '未設定 VITE_POCKETBASE_URL。請複製 .env.example 為 .env.local 並填入 PocketBase 網址。';
    authReady.value = true;
    return;
  }
  authListenerAttached = true;
  const pb = getPocketBase();
  pb.authStore.onChange(() => {
    authError.value = null;
    syncUserFromStore();
  }, true);
}

async function login(email, password) {
  if (!isPocketBaseConfigured()) throw new Error(authError.value || 'Auth 未設定');
  authError.value = null;
  const pb = getPocketBase();
  await pb.collection('users').authWithPassword(email.trim(), password);
}

async function logout() {
  if (!isPocketBaseConfigured()) return;
  authError.value = null;
  getPocketBase().authStore.clear();
}

async function reauthenticateWithPassword(password) {
  const pb = getPocketBase();
  const model = pb.authStore.record;
  if (!model?.email) throw new Error('未登入');
  authError.value = null;
  await pb.collection('users').authWithPassword(model.email, password);
}

async function changePassword(currentPassword, newPassword) {
  await reauthenticateWithPassword(currentPassword);
  const pb = getPocketBase();
  const id = pb.authStore.record?.id;
  if (!id) throw new Error('未登入');
  await pb.collection('users').update(id, {
    oldPassword: currentPassword,
    password: newPassword,
    passwordConfirm: newPassword,
  });
}

export function useAuth() {
  initAuth();
  return {
    user,
    authReady,
    authError,
    login,
    logout,
    changePassword,
    verifyPassword: reauthenticateWithPassword,
  };
}
