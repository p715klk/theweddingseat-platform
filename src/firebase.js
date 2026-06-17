import { initializeApp, getApps } from 'firebase/app';
import firebase from 'firebase/compat/app';
import 'firebase/compat/database';

/**
 * Firebase Web 設定（apiKey 係公開資料，可放 frontend）
 * 從 Firebase Console → 專案設定 → 你的應用程式 → 複製設定
 */
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'theweddingseat-prod.firebaseapp.com',
  databaseURL:
    import.meta.env.VITE_FIREBASE_DATABASE_URL ||
    'https://theweddingseat-prod-default-rtdb.asia-southeast1.firebasedatabase.app/',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'theweddingseat-prod',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'theweddingseat-prod.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
};

const initConfig = firebaseConfig.apiKey
  ? firebaseConfig
  : { databaseURL: firebaseConfig.databaseURL };

// Modular app（Auth、Functions）
export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(initConfig);

// Compat RTDB：WebSocket 長連線，同舊版 HTML admin 一致
if (!firebase.apps.length) {
  firebase.initializeApp(initConfig);
}

export const database = firebase.database();
