/**
 * 將 .env.local 同步去 public/legacy/js/firebase_config.js（legacy iframe 用 compat SDK）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const envPath = join(root, '.env.local');
const outPath = join(root, 'public', 'legacy', 'js', 'firebase_config.js');

function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i < 0) continue;
    env[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim();
  }
  return env;
}

const env = existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {};

const databaseURL =
  env.VITE_FIREBASE_DATABASE_URL ||
  'https://theweddingseat-prod-default-rtdb.asia-southeast1.firebasedatabase.app/';

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'theweddingseat-prod.firebaseapp.com',
  databaseURL,
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'theweddingseat-prod',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'theweddingseat-prod.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: env.VITE_FIREBASE_APP_ID || '',
};

const body = config.apiKey
  ? `const firebaseConfig = ${JSON.stringify(config, null, 4)};`
  : `const firebaseConfig = { databaseURL: ${JSON.stringify(databaseURL)} };`;

const file = `// 自動生成 — npm run sync:legacy-config（來源 .env.local）
${body}

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();
`;

writeFileSync(outPath, file, 'utf8');
console.log('Synced legacy firebase_config.js');
