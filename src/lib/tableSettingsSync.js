const CHANNEL_PREFIX = 'tws-table-settings-sync';

/** seating / admin 寫入 table_settings 後通知其他分頁（同瀏覽器） */
export function broadcastTableSettingsChange(tenantId) {
  const tid = String(tenantId || '').trim();
  if (!tid || typeof BroadcastChannel === 'undefined') return;
  try {
    const ch = new BroadcastChannel(`${CHANNEL_PREFIX}:${tid}`);
    ch.postMessage({ at: Date.now() });
    ch.close();
  } catch {
    /* ignore */
  }
}

/** slug 點名頁監聽枱位變更 */
export function onTableSettingsChange(tenantId, callback) {
  const tid = String(tenantId || '').trim();
  if (!tid || typeof BroadcastChannel === 'undefined') return () => {};
  try {
    const ch = new BroadcastChannel(`${CHANNEL_PREFIX}:${tid}`);
    ch.onmessage = () => callback();
    return () => {
      try {
        ch.close();
      } catch {
        /* ignore */
      }
    };
  } catch {
    return () => {};
  }
}
