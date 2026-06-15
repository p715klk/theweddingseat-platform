import { ref } from 'vue';
import { onValue, set, get } from 'firebase/database';
import { useTenant } from '@/composables/useTenant';
import { normalizeTags, PRIMARY_TAG_KEY } from '@/lib/guestUtils';

const DEFAULT_CATEGORIES = ['LK', '家人', '男方親戚', '女方親戚', '中學同學'];

export function useAdminGuests() {
  const { tenantRef } = useTenant();
  const guests = ref([]);
  const categories = ref([...DEFAULT_CATEGORIES]);
  const dirty = ref(false);
  const loading = ref(false);
  const guestStatus = ref({});
  let unsub = null;

  function processRaw(weddingGuests, unassignedGuests) {
    const list = [];
    Object.keys(weddingGuests || {})
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
      .forEach((tableNum) => {
        const tableGuests = weddingGuests[tableNum];
        if (!Array.isArray(tableGuests)) return;
        tableGuests.forEach((g) => {
          if (!g?.name) return;
          const key = `${tableNum}_${g.name}`;
          const canceled = guestStatus.value[key]?.arrived === '取消';
          list.push({
            name: g.name,
            side: g.side || '男方',
            table: parseInt(tableNum, 10),
            sort: parseInt(g.sort, 10) || 1,
            group: normalizeTags(g.group ?? g[PRIMARY_TAG_KEY]),
            isCanceled: canceled,
          });
        });
      });
    (unassignedGuests || []).forEach((g) => {
      if (!g?.name) return;
      list.push({
        name: g.name,
        side: g.side || '男方',
        table: '',
        sort: 99,
        group: normalizeTags(g.group ?? g[PRIMARY_TAG_KEY]),
        isCanceled: false,
      });
    });
    list.sort((a, b) => {
      const ta = a.table === '' ? 9999 : a.table;
      const tb = b.table === '' ? 9999 : b.table;
      if (ta !== tb) return ta - tb;
      return (a.sort || 99) - (b.sort || 99);
    });
    guests.value = list;
    dirty.value = false;
  }

  async function load() {
    loading.value = true;
    try {
      const [gSnap, uSnap, mSnap, sSnap] = await Promise.all([
        get(tenantRef('wedding_guests')),
        get(tenantRef('unassigned_guests')),
        get(tenantRef('meta_label_columns')),
        get(tenantRef('guest_status')),
      ]);
      guestStatus.value = sSnap.val() || {};
      const meta = mSnap.val();
      if (meta?.categories?.group) {
        categories.value = [...meta.categories.group];
      }
      processRaw(gSnap.val() || {}, uSnap.val() || []);
    } finally {
      loading.value = false;
    }
  }

  function startSync() {
    stopSync();
    unsub = onValue(tenantRef('wedding_guests'), async () => {
      if (dirty.value) return;
      await load();
    });
  }

  function stopSync() {
    if (unsub) unsub();
    unsub = null;
  }

  function addGuest() {
    guests.value.push({
      name: '',
      side: '男方',
      table: '',
      sort: 99,
      group: [],
      isCanceled: false,
    });
    dirty.value = true;
  }

  function removeGuest(index) {
    guests.value.splice(index, 1);
    dirty.value = true;
  }

  function markDirty() {
    dirty.value = true;
  }

  async function save() {
    const wedding = {};
    const unassigned = [];
    guests.value.forEach((g) => {
      if (!g.name?.trim()) return;
      const row = {
        name: g.name.trim(),
        side: g.side,
        group: normalizeTags(g.group),
      };
      if (g.table === '' || g.table == null || isNaN(g.table)) {
        row.sort = 99;
        unassigned.push(row);
      } else {
        const t = parseInt(g.table, 10);
        if (!wedding[t]) wedding[t] = [];
        row.sort = parseInt(g.sort, 10) || 1;
        wedding[t].push(row);
      }
    });

    await Promise.all([
      set(tenantRef('wedding_guests'), wedding),
      set(tenantRef('unassigned_guests'), unassigned),
      set(tenantRef('meta_label_columns'), {
        keys: ['group'],
        names: ['標籤 (可多選)'],
        categories: { group: categories.value },
      }),
    ]);
    dirty.value = false;
    await load();
  }

  return {
    guests,
    categories,
    dirty,
    loading,
    load,
    save,
    addGuest,
    removeGuest,
    markDirty,
    startSync,
    stopSync,
  };
}
