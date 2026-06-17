import { ref, computed } from 'vue';
import { ref as dbRef, get, child } from '@/rtdb';
import { database } from '@/firebase';
import { resolveTenantFeatures } from '@/lib/tenantFeatures';

const slug = ref('');
const tenantId = ref('');
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

function tenantPath(subPath = '') {
  const base = `tenants/${tenantId.value}`;
  return subPath ? `${base}/${subPath}` : base;
}

function tenantRef(subPath = '') {
  return dbRef(database, tenantPath(subPath));
}

async function initTenant(route, options = {}) {
  const { featureGate = null, allowWhenDisabled = false, allowExpired = false } = options;
  ready.value = false;
  error.value = null;
  isExpired.value = false;

  slug.value = resolveSlugFromRoute(route);

  try {
    const slugSnap = await get(child(dbRef(database), `slugs/${slug.value}`));
    tenantId.value = slugSnap.val() || slug.value;

    const metaSnap = await get(tenantRef('meta'));
    const metaVal = metaSnap.val();
    if (!metaVal) {
      error.value = `找不到專案「${slug.value}」`;
      return;
    }

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

export function useTenant() {
  return {
    slug,
    tenantId,
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
