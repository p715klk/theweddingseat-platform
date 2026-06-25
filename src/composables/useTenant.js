import { ref, computed } from 'vue';
import { findTenantBySlug, getTenantMeta } from '@/lib/pb/tenant';
import { tenantDataDbRef } from '@/lib/pb/dataRef';
import { resolveTenantFeatures } from '@/lib/tenantFeatures';

const slug = ref('');
const tenantId = ref('');
const tenantRecordId = ref('');
const tenantDataRecordId = ref('');
const meta = ref(null);
const ready = ref(false);
const error = ref(null);
const isExpired = ref(false);
const features = ref({ checkin: true, guestlist: true, seating: true });

const FEATURE_LABELS = {
  checkin: '點名',
  guestlist: '名單',
  seating: '畫布',
};

function resolveSlugFromRoute(route) {
  if (route.params.slug) return String(route.params.slug);
  const q = route.query.slug;
  if (q) return String(q);
  return 'demo';
}

async function initTenant(route, options = {}) {
  const { featureGate = null, allowWhenDisabled = false, allowExpired = false } = options;
  ready.value = false;
  error.value = null;
  isExpired.value = false;
  tenantRecordId.value = '';
  tenantDataRecordId.value = '';

  slug.value = resolveSlugFromRoute(route);

  try {
    const info = await findTenantBySlug(slug.value);
    if (!info) {
      error.value = `找不到專案「${slug.value}」`;
      return;
    }

    tenantId.value = info.tenantId;
    tenantRecordId.value = info.id;

    const metaVal = await getTenantMeta(info.tenantId);
    if (!metaVal) {
      error.value = `找不到專案「${slug.value}」`;
      return;
    }

    const { findTenantDataRecord } = await import('@/lib/pb/tenantData');
    const dataRec = await findTenantDataRecord(info.tenantId);
    if (dataRec?.id) tenantDataRecordId.value = dataRec.id;

    const resolved = resolveTenantFeatures(metaVal);
    features.value = resolved;
    isExpired.value = !resolved.checkin;

    const gate = featureGate || null;
    const bypass = allowWhenDisabled || allowExpired;
    if (gate && !resolved[gate] && !bypass) {
      error.value = `此專案${FEATURE_LABELS[gate] || gate}功能已停用`;
      return;
    }

    meta.value = metaVal;
    ready.value = true;
  } catch (e) {
    error.value = e?.message || '載入失敗';
  }
}

const themeColor = computed(() => meta.value?.theme_color || '#b91c1c');
const coupleNames = computed(() => meta.value?.couple_names || '');
const venueLabel = computed(() => {
  const parts = [meta.value?.venue_name, meta.value?.venue_hall].filter(Boolean);
  return parts.length ? `${parts.join(' · ')} 現場即時點名` : '';
});

function tenantRef(subPath = '') {
  return tenantDataDbRef(tenantId.value, subPath);
}

function tenantPath(subPath = '') {
  const id = tenantId.value;
  const base = `tenants/${id}`;
  return subPath ? `${base}/${subPath}` : base;
}

export function useTenant() {
  return {
    slug,
    tenantId,
    tenantRecordId,
    tenantDataRecordId,
    meta,
    ready,
    error,
    isExpired,
    features,
    themeColor,
    coupleNames,
    venueLabel,
    initTenant,
    tenantRef,
    tenantPath,
  };
}
