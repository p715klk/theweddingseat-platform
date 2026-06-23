import { database } from '@/lib/pocketbaseRtdb';
import { isPocketBaseConfigured } from '@/lib/pocketbaseClient';

export const pocketbaseConfig = {
  url: import.meta.env.VITE_POCKETBASE_URL || '',
};

/** @deprecated Use pocketbaseConfig — kept for gradual import migration */
export const firebaseConfig = {
  apiKey: isPocketBaseConfigured() ? 'pocketbase' : '',
  databaseURL: pocketbaseConfig.url,
};

export { database };
