<template>
  <div class="checkin-page min-h-screen">
    <TenantErrorView v-if="error" :message="error" />
    <div v-else-if="loading" class="min-h-screen flex items-center justify-center bg-gray-100 text-gray-500 font-bold">
      ⏳ 載入中...
    </div>
    <div v-else class="bg-gray-100 text-gray-800 font-sans pb-12 select-none min-h-screen">
    <div
      v-if="isExpired"
      class="sticky top-0 z-[60] bg-amber-100 border-b border-amber-300 text-amber-950 text-center text-xs font-bold py-2 px-3"
    >
      ⚠️ 此專案已 expired — 公開點名已停用
      <span v-if="isPlatformAdmin">（平台預覽模式，你仍可睇到頁面）</span>
    </div>
    <header
      class="text-white p-4 shadow-md sticky top-0 z-50 flex justify-center items-center"
      :style="{ backgroundColor: themeColor }"
    >
      <div class="text-center">
        <h1 class="text-xl font-bold tracking-wider">{{ coupleNames || '載入中...' }}</h1>
        <p class="text-xs opacity-90 mt-1">{{ venueLabel || '載入中...' }}</p>
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
      @click.self="selectedTable = null"
    >
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div class="p-4 bg-red-50 border-b border-red-100 flex justify-between items-center">
          <h2 class="text-lg font-bold text-red-800">第 {{ selectedTable }} 桌賓客名單</h2>
          <button type="button" class="text-gray-500 text-2xl font-bold px-2" @click="selectedTable = null">
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
        <div class="p-4 border-t bg-gray-50 text-right">
          <button
            type="button"
            class="bg-gray-500 text-white px-4 py-2 rounded shadow hover:bg-gray-600"
            @click="selectedTable = null"
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
import { useAuth } from '@/composables/useAuth';
import TenantErrorView from '@/views/TenantErrorView.vue';

const route = useRoute();
const loading = ref(true);
const { authReady } = useAuth();
const { isPlatformAdmin, platformAdminReady } = usePlatformAdmin();
const { error, isExpired, themeColor, coupleNames, venueLabel, initTenant } = useTenant();
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
  guestStatus,
  parseArrivedStatus,
  guestStatusKey,
  normalizeTags,
  guestMatchesKeyword,
} = useCheckIn();

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

const checkInLocked = computed(() => isExpired.value);

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
    await initTenant(route, { allowExpired: isPlatformAdmin.value });
    if (!error.value) startSync();
  } finally {
    loading.value = false;
  }
}

let authGatePassed = false;

watch(
  [authReady, platformAdminReady],
  ([authOk, platformOk]) => {
    if (!authOk || !platformOk || authGatePassed) return;
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

onUnmounted(stopSync);

function openTable(num) {
  selectedTable.value = String(num);
  searchKeyword.value = '';
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
