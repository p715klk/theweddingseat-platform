import PocketBase from 'pocketbase';

const pbUrl = import.meta.env.VITE_POCKETBASE_URL || '';

/** @type {PocketBase | null} */
let pbInstance = null;

export function getPocketBaseUrl() {
  return pbUrl;
}

export function isPocketBaseConfigured() {
  return Boolean(pbUrl);
}

export function getPocketBase() {
  if (!pbUrl) {
    throw new Error(
      '未設定 VITE_POCKETBASE_URL。請複製 .env.example 為 .env.local 並填入 PocketBase 網址。',
    );
  }
  if (!pbInstance) {
    pbInstance = new PocketBase(pbUrl);
    pbInstance.autoCancellation(false);
  }
  return pbInstance;
}

export default getPocketBase;
