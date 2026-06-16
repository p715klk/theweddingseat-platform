<template>
  <div class="checkin-page min-h-screen">
    <div
      v-if="isDev"
      class="fixed bottom-2 left-2 z-[9999] text-[11px] font-mono bg-black/70 text-white px-2 py-1 rounded"
    >
      requireLogin={{ requireLogin }} · authReady={{ authReady }} · user={{ user ? 'yes' : 'no' }}
    </div>
    <TenantErrorView v-if="error" :message="error" />
    <div
      v-else-if="requireLogin && authReady && !user"
      class="min-h-screen flex items-center justify-center bg-gray-100 p-4"
    >
      <FrontendLoginForm @success="onLoggedIn" />
    </div>
    <div v-else-if="loading" class="min-h-screen flex items-center justify-center bg-gray-100 text-gray-500 font-bold">
      ⏳ 載入中...
    </div>
    <div v-else class="bg-gray-100 text-gray-800 font-sans pb-12 select-none min-h-screen">
    <div
      v-if="!features.checkin"
      class="sticky top-0 z-[60] bg-amber-100 border-b border-amber-300 text-amber-950 text-center text-xs font-bold py-2 px-3"
    >
      ⚠️ 點名功能已停用
      <span v-if="isPlatformAdmin">（平台預覽模式，你仍可睇到頁面）</span>
    </div>
    <header
      class="text-white p-4 shadow-md sticky top-0 z-50 flex justify-between items-center gap-3"
      :style="{ backgroundColor: themeColor }"
    >
      <div class="flex-1" />
      <div class="text-center flex-shrink-0">
        <h1 class="text-xl font-bold tracking-wider">{{ coupleNames || '載入中...' }}</h1>
        <p class="text-xs opacity-90 mt-1">{{ venueLabel || '載入中...' }}</p>
      </div>
      <div class="flex-1 flex justify-end items-center gap-2">
        <router-link
          v-if="canAccessAdmin"
          :to="adminRoute"
          class="bg-white/15 hover:bg-white/25 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold border border-white/30 transition whitespace-nowrap"
        >
          📋 後台管理
        </router-link>
        <button
          v-if="user"
          type="button"
          class="bg-white/15 hover:bg-white/25 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold border border-white/30 transition whitespace-nowrap"
          @click="handleLogout"
        >
          登出
        </button>
      </div>
    </header>

    <div class="max-w-xl mx-auto mt-2 px-4">
      <div class="relative">
        <input
          v-model="searchKeyword"
          type="text"
          placeholder="🔍 搜尋賓客姓名、來源或標籤"
          class="w-full py-1.5 px-3 pl-8 pr-8 rounded-lg border border-red-200 shadow-sm focus:outline-none focus:border-red-500 text-sm"
        />
        <button
          v-if="searchKeyword"
          type="button"
          class="absolute right-2 top-1 text-gray-400 hover:text-gray-600 font-bold text-lg leading-none"
          @click="searchKeyword = ''"
        >
          &times;
        </button>
      </div>
      <div
        v-if="searchKeyword.trim()"
        class="mt-1.5 space-y-1.5 max-h-64 overflow-y-auto bg-white p-1.5 rounded-lg shadow-lg border border-gray-200"
      >
        <p v-if="!searchResults().length" class="text-gray-400 text-sm py-2 text-center">找不到匹配的賓客</p>
        <div
          v-for="row in searchResults()"
          :key="`${row.tableNum}_${row.guest.name}`"
          class="p-2 rounded-lg flex justify-between items-center gap-2 border border-red-100 bg-red-50"
          :class="{ 'opacity-50 line-through': row.arrived === '取消' }"
        >
          <button type="button" class="flex-1 text-left" @click="openTable(row.tableNum)">
            <span class="font-bold text-gray-800">{{ row.guest.name }}</span>
            <span class="block text-xs text-red-700 mt-1">第 {{ row.tableNum }} 桌 · {{ row.guest.side }}</span>
          </button>
          <div class="flex gap-1">
            <button
              type="button"
              class="px-2 py-1 text-xs font-black rounded border"
              :class="arrivedBtnClass(row.arrived)"
              :disabled="checkInLocked"
              @click="onCycleArrived(row.tableNum, row.guest.name, row.arrived)"
            >
              {{ arrivedLabel(row.arrived) }}
            </button>
            <button
              type="button"
              class="px-2 py-1 text-xs font-black rounded border"
              :class="giftBtnClass(row.gift)"
              :disabled="checkInLocked"
              @click="onCycleGift(row.tableNum, row.guest.name, row.gift)"
            >
              {{ giftLabel(row.gift) }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="max-w-xl mx-auto mt-2 px-4">
      <div class="bg-gray-300 text-center py-1 rounded text-xs font-bold shadow-inner tracking-wider text-gray-700">
        舞台 STAGE
      </div>
    </div>

    <div class="floor-plan-section mx-auto px-2 sm:px-4 pb-4">
      <p
        v-if="!floorLayout.items.length"
        class="text-center text-sm text-gray-500 py-8 px-4"
      >
        尚未有枱位顯示。請到後台為賓客設定枱號，或使用畫布排位儲存平面圖。
      </p>
      <div v-else class="floor-plan-wrap">
        <main
          id="floor-plan"
          aria-label="婚宴枱位平面圖"
          :style="floorStyle(floorLayout.bounds)"
        >
          <div
            v-for="item in floorLayout.items"
            :key="item.num"
            class="floor-cell-table bg-white rounded-xl shadow-md border-2 cursor-pointer hover:border-red-400 transition active:scale-95"
            :class="cardBorderClass(tablePercent(item.num).percent, tablePercent(item.num).active)"
            :style="tableStyle(item, floorLayout.bounds)"
            @click="openTable(item.num)"
          >
            <span class="floor-table-label font-bold text-gray-500">第 {{ item.num }} 桌</span>
            <div :class="circleClass(tablePercent(item.num).percent, tablePercent(item.num).active)">
              {{ tablePercent(item.num).percent }}%
            </div>
          </div>
        </main>
      </div>
      <p
        v-if="floorLayout.items.length && showFloorScrollHint"
        class="text-center text-xs text-gray-400 mt-2"
      >
        ↔↕ 枱位較多，可左右／上下滑動查看
      </p>
    </div>

    <div
      v-if="selectedTable"
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      @click.self="closeTableModal"
    >
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div class="px-4 py-3 bg-red-50 border-b border-red-100 flex justify-between items-center">
          <h2 class="text-lg font-bold text-red-800 leading-snug">
            第 {{ selectedTable }} 桌賓客名單
            <span class="text-sm font-bold text-red-600/80">
              (座位數 {{ tableOccupancy.occupied }}/{{ tableOccupancy.max }} 位)
            </span>
          </h2>
          <button type="button" class="text-gray-500 text-2xl font-bold px-2 leading-none" @click="closeTableModal">
            &times;
          </button>
        </div>
        <div class="p-4 overflow-y-auto space-y-3 flex-1">
          <div
            v-for="guest in sortedGuests(selectedTable)"
            :key="guest.name"
            class="p-2.5 rounded-lg border flex justify-between items-center gap-2 shadow-sm"
            :class="modalRowClass(selectedTable, guest)"
          >
            <div class="flex flex-col flex-1 text-left">
              <span class="font-bold text-gray-800">{{ guest.name }}</span>
              <div class="flex gap-1 mt-1 flex-wrap">
                <span
                  class="px-2 py-0.5 rounded text-xs font-bold"
                  :class="guest.side === '女方' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'"
                >
                  {{ guest.side }}
                </span>
                <span
                  v-for="tag in normalizeTags(guest.group)"
                  :key="tag"
                  class="px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-700"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
            <div class="flex gap-1 items-center">
              <button
                type="button"
                class="px-2.5 py-2 text-xs font-black rounded border shadow-sm"
                :class="arrivedBtnClass(guestArrived(selectedTable, guest))"
                :disabled="checkInLocked"
                @click="onCycleArrived(selectedTable, guest.name, guestArrived(selectedTable, guest))"
              >
                {{ arrivedLabel(guestArrived(selectedTable, guest)) }}
              </button>
              <button
                type="button"
                class="px-2.5 py-2 text-xs font-black rounded border shadow-sm"
                :class="giftBtnClass(guestGift(selectedTable, guest))"
                :disabled="checkInLocked"
                @click="onCycleGift(selectedTable, guest.name, guestGift(selectedTable, guest))"
              >
                {{ giftLabel(guestGift(selectedTable, guest)) }}
              </button>
            </div>
          </div>
        </div>
        <div v-if="canAccessAdmin && tableOccupancy.remaining > 0" class="p-3 border-t bg-white">
          <div v-if="!showAddGuestForm">
            <button
              type="button"
              class="w-full py-2.5 text-sm font-bold rounded-lg border-2 border-dashed border-red-300 text-red-700 bg-red-50 hover:bg-red-100 transition shadow-sm"
              :disabled="checkInLocked || addingGuest"
              @click="showAddGuestForm = true"
            >
              + 填入此桌新賓客 / 臨時帶伴 (餘下 {{ tableOccupancy.remaining }} 空位)
            </button>
          </div>
          <form v-else class="space-y-2" @submit.prevent="submitWalkInGuest">
            <div>
              <label class="block text-xs font-bold text-gray-500 mb-1">姓名</label>
              <input
                v-model="walkInName"
                type="text"
                required
                placeholder="若是眷屬，請遵循：主客姓名 眷屬 X"
                class="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>
            <div class="flex gap-2">
              <div class="flex-1">
                <label class="block text-xs font-bold text-gray-500 mb-1">來源</label>
                <select v-model="walkInSide" class="w-full border border-gray-300 rounded-lg p-2 text-sm">
                  <option value="男方">男方</option>
                  <option value="女方">女方</option>
                </select>
              </div>
              <div class="flex-[2]">
                <label class="block text-xs font-bold text-gray-500 mb-1">標籤</label>
                <input
                  v-model="walkInGroup"
                  type="text"
                  placeholder="現場加座"
                  class="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
            </div>
            <p v-if="walkInError" class="text-xs text-red-600 font-bold">{{ walkInError }}</p>
            <div class="flex gap-2">
              <button
                type="button"
                class="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold"
                :disabled="addingGuest"
                @click="cancelWalkInForm"
              >
                取消
              </button>
              <button
                type="submit"
                class="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold disabled:opacity-60"
                :disabled="addingGuest"
              >
                {{ addingGuest ? '新增中…' : '確認新增' }}
              </button>
            </div>
          </form>
        </div>
        <div
          v-else-if="selectedTable && tableOccupancy.remaining <= 0"
          class="px-4 py-3 border-t bg-gray-50 text-center text-xs font-bold text-gray-400"
        >
          🔒 此圍已滿 {{ tableOccupancy.max }} 人（如需加人，請先將其他賓客設為「取消」釋放座位）
        </div>
        <div class="p-4 border-t bg-gray-50 text-right">
          <button
            type="button"
            class="bg-gray-500 text-white px-4 py-2 rounded shadow hover:bg-gray-600"
            @click="closeTableModal"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { useTenant } from '@/composables/useTenant';
import { useCheckIn } from '@/composables/useCheckIn';
import { usePlatformAdmin } from '@/composables/usePlatformAdmin';
import { useTenantAccess } from '@/composables/useTenantAccess';
import { useAuth } from '@/composables/useAuth';
import TenantErrorView from '@/views/TenantErrorView.vue';
import FrontendLoginForm from '@/components/auth/FrontendLoginForm.vue';

const route = useRoute();
const loading = ref(true);
const isDev = import.meta.env.DEV;
const requireLogin = String(import.meta.env.VITE_FRONTEND_REQUIRE_LOGIN || '').toLowerCase() === 'true';
const { user, authReady, logout } = useAuth();
const { isPlatformAdmin, platformAdminReady } = usePlatformAdmin();
const { canAccessAdmin } = useTenantAccess();
const { error, features, themeColor, coupleNames, venueLabel, initTenant } = useTenant();
const {
  floorLayout,
  selectedTable,
  searchKeyword,
  startSync,
  stopSync,
  tablePercent,
  circleClass,
  cardBorderClass,
  cycleArrived,
  cycleGift,
  floorStyle,
  tableStyle,
  sortedGuests,
  searchResults,
  getTableOccupancy,
  addWalkInGuest,
  guestStatus,
  parseArrivedStatus,
  guestStatusKey,
  normalizeTags,
  guestMatchesKeyword,
} = useCheckIn();

const showAddGuestForm = ref(false);
const walkInName = ref('');
const walkInSide = ref('男方');
const walkInGroup = ref('現場加座');
const walkInError = ref('');
const addingGuest = ref(false);

const adminRoute = computed(() => `/p/${route.params.slug}/admin`);

const tableOccupancy = computed(() => {
  if (!selectedTable.value) return { occupied: 0, max: 12, remaining: 0 };
  return getTableOccupancy(selectedTable.value);
});

const showFloorScrollHint = ref(false);

watch(
  () => floorLayout.value.items.length,
  async () => {
    await nextTick();
    const plan = document.getElementById('floor-plan');
    const wrap = plan?.parentElement;
    if (!plan || !wrap) {
      showFloorScrollHint.value = false;
      return;
    }
    showFloorScrollHint.value =
      plan.offsetWidth > wrap.clientWidth || plan.offsetHeight > wrap.clientHeight;
  },
  { immediate: true },
);

const checkInLocked = computed(() => !features.value.checkin);

function onCycleArrived(table, name, current) {
  if (checkInLocked.value) return;
  cycleArrived(table, name, current);
}

function onCycleGift(table, name, current) {
  if (checkInLocked.value) return;
  cycleGift(table, name, current);
}

async function bootCheckIn() {
  loading.value = true;
  try {
    await initTenant(route, {
      featureGate: 'checkin',
      allowWhenDisabled: isPlatformAdmin.value,
    });
    if (!error.value) startSync();
  } finally {
    loading.value = false;
  }
}

let authGatePassed = false;

watch(
  [authReady, platformAdminReady, user],
  ([authOk, platformOk, u]) => {
    if (!authOk || !platformOk || authGatePassed) return;
    if (requireLogin && !u) return;
    authGatePassed = true;
    bootCheckIn();
  },
  { immediate: true },
);

watch(
  () => route.params.slug,
  () => {
    if (authGatePassed) bootCheckIn();
  },
);

watch(
  user,
  (u) => {
    if (!requireLogin) return;
    if (!u) {
      authGatePassed = false;
      stopSync();
    }
  },
);

onUnmounted(stopSync);

function onLoggedIn() {
  /* auth state updates automatically */
}

async function handleLogout() {
  closeTableModal();
  stopSync();
  authGatePassed = false;
  loading.value = false;
  await logout();
}

function openTable(num) {
  selectedTable.value = String(num);
  searchKeyword.value = '';
  resetWalkInForm();
}

function closeTableModal() {
  selectedTable.value = null;
  resetWalkInForm();
}

function resetWalkInForm() {
  showAddGuestForm.value = false;
  walkInName.value = '';
  walkInSide.value = '男方';
  walkInGroup.value = '現場加座';
  walkInError.value = '';
}

function cancelWalkInForm() {
  showAddGuestForm.value = false;
  walkInName.value = '';
  walkInError.value = '';
}

async function submitWalkInGuest() {
  if (checkInLocked.value || !selectedTable.value) return;
  walkInError.value = '';
  addingGuest.value = true;
  try {
    await addWalkInGuest(selectedTable.value, {
      name: walkInName.value,
      side: walkInSide.value,
      group: walkInGroup.value,
    });
    resetWalkInForm();
  } catch (err) {
    walkInError.value = err?.message || '新增失敗，請確認已登入並有寫入權限';
  } finally {
    addingGuest.value = false;
  }
}

function guestArrived(table, guest) {
  return parseArrivedStatus(guestStatus.value[guestStatusKey(table, guest.name)]?.arrived);
}

function guestGift(table, guest) {
  return guestStatus.value[guestStatusKey(table, guest.name)]?.gift || '未交';
}

function modalRowClass(table, guest) {
  const st = guestArrived(table, guest);
  if (st === '取消') return 'bg-red-50/50 opacity-50 line-through border-red-200';
  return 'bg-gray-50 border-gray-200';
}

function arrivedLabel(s) {
  if (s === '已到') return '🟢 已到';
  if (s === '取消') return '❌ 取消';
  return '⚪ 未到';
}

function arrivedBtnClass(s) {
  if (s === '已到') return 'bg-green-600 text-white border-green-700';
  if (s === '取消') return 'bg-red-100 text-red-700 border-red-300';
  return 'bg-gray-200 text-gray-700 border-gray-300';
}

function giftLabel(s) {
  if (s === '人情') return '✉️ 人情';
  if (s === '送金器') return '👑 金器';
  if (s === '電子人情') return '📱 電子人情';
  return '⚪ 禮金';
}

function giftBtnClass(s) {
  return s !== '未交' ? 'bg-red-600 text-white border-red-700' : 'bg-gray-200 text-gray-600 border-gray-300';
}
</script>
