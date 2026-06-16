export const DEFAULT_TENANT_FEATURES = {
  checkin: true,
  guestlist: true,
  seating: true,
};

/** 舊 `status: expired` 只會停用點名；其餘功能預設保持開啟 */
export function resolveTenantFeatures(meta) {
  const m = meta || {};
  const f = m.features || {};
  if (!m.features && m.status === 'expired') {
    return { checkin: false, guestlist: true, seating: true };
  }
  return {
    checkin: f.checkin !== false,
    guestlist: f.guestlist !== false,
    seating: f.seating !== false,
  };
}

export function featureStatusLabel(meta) {
  const f = resolveTenantFeatures(meta);
  const off = [];
  if (!f.checkin) off.push('點名');
  if (!f.guestlist) off.push('名單');
  if (!f.seating) off.push('畫布');
  if (!off.length) return '全部開啟';
  return `已關：${off.join('、')}`;
}
