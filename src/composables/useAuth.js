import { ref } from 'vue';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { firebaseApp, firebaseConfig } from '@/firebase';

const user = ref(null);
const authReady = ref(false);
const authError = ref(null);

let authInstance = null;
let authListenerAttached = false;

function getAuthInstance() {
  if (!firebaseConfig.apiKey) {
    authError.value =
      '未設定 Firebase apiKey。請複製 .env.example 為 .env.local 並填入 Firebase Console 的 Web 設定。';
    return null;
  }
  if (!authInstance) {
    authInstance = getAuth(firebaseApp);
  }
  return authInstance;
}

function initAuth() {
  if (authListenerAttached) return;
  const auth = getAuthInstance();
  if (!auth) {
    authReady.value = true;
    return;
  }
  authListenerAttached = true;

  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn('Auth persistence 設定失敗:', err);
  });

  onAuthStateChanged(
    auth,
    (u) => {
      user.value = u;
      authReady.value = true;
    },
    (err) => {
      console.error('Auth 狀態錯誤:', err);
      authError.value = err?.message || 'Auth 初始化失敗';
      authReady.value = true;
    },
  );
}

async function login(email, password) {
  const auth = getAuthInstance();
  if (!auth) throw new Error(authError.value || 'Auth 未設定');
  authError.value = null;
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

async function logout() {
  const auth = getAuthInstance();
  if (!auth) return;
  authError.value = null;
  await signOut(auth);
}

export function useAuth() {
  initAuth();
  return { user, authReady, authError, login, logout };
}
