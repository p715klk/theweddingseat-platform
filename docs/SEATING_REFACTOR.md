# Seating（畫布）重構記錄

> 目的：將原本約 3k 行嘅 `src/seating/seatingEngine.js` 拆細成「多個 module + 1 個 facade」，令 code 更短、更易維護，同時保持 Vue component 端嘅呼叫方式基本不變。
>
> 原則：**seatingEngine.js 只做 orchestration / state / exports**；邏輯分散到 `src/seating/engine/*`。

---

## 已完成改動（已落地）

### 1) 加入可直接 call 嘅 library（縮位用）
- **新增依賴**（`package.json`）：
  - `@vueuse/core`
  - `lodash-es`

### 2) 事件綁定統一用 `@vueuse/core`
- **位置**：`src/seating/seatingEngine.js`
- **改動**：
  - `onEvent()` 由手寫 `addEventListener/removeEventListener` 改為 `useEventListener()`，並將 stop function 收入 `cleanupFns`，確保 `destroySeatingEngine()` 會一致清理。

### 3) 抽離 Firebase realtime sync / 初次載入
- **新增檔案**：`src/seating/engine/seatingSync.js`
- **做法**：`createSeatingSync(ctx)`（依賴注入）
  - 把以下邏輯由 `seatingEngine.js` 抽走：
    - `handleSeatingDataRoot`
    - `startSeatingRealtimeSync`
    - `bootstrapSeatingFromFetch`
  - 仍保留同樣資料流：
    - guests/pool/tables/meta 分開監聽
    - 首次 `get()` 取資料做 bootstrap
    - UUID migration（補齊 `guest.id`）仍會觸發一次性回寫

### 4) 抽離 pool 分組 / view-model / 通知
- **新增檔案**：`src/seating/engine/poolViewModel.js`
- **做法**：`createPoolViewModel(ctx)`
  - pool 分組用 `lodash-es` 的 `groupBy` / `uniq`，避免手寫大量 loop / set
  - `seatingEngine.js` 內保留 `notifyPoolChange()` facade，但實際交畀 module

### 5) 抽離桌拖拉（table drag）
- **新增檔案**：`src/seating/engine/tableDrag.js`
- **做法**：`createTableDrag(ctx)`
  - 把 `bindTablePlateDrag` / `bindTableDragHandlers` / `cancelTableDrag` 封裝成 module
  - `seatingEngine.js` 保留同名 export 俾 Vue component 端繼續 call

### 6) 修正：枱上賓客「標籤消失 / 來源錯」
- **問題原因**：
  - `getTableViewModel()` 曾經將 `seat.guest` 縮到只剩顯示欄位（例如 `name/displayHtml/sideClass`），導致：
    - guest modal 需要用到嘅 `group/side/id` 等欄位缺失 → 標籤空、來源 default 錯
- **修正做法**：
  - `getTableViewModel()` 改為 **保留原始 guest**（`...guest`），再疊加顯示欄位：
    - `displayHtml`
    - `nameClass`
    - `sideClass`

---

## 現時架構（概念）

### `src/seating/seatingEngine.js`（Facade）
- **負責**：
  - 保持對外 export API 形狀穩定（Vue components 依舊 `import { ... } from '@/seating/seatingEngine'`）
  - 維持全域 state（`allGuests` / `unassignedPool` / `tableSettings` / transform 等）
  - 初始化/銷毀（`initSeatingEngine` / `destroySeatingEngine`）
  - 組裝各個 module（依賴注入）

### `src/seating/engine/*`（Modules）
- `seatingSync.js`：RTDB 同步 + 初次載入 + root 合併
- `poolViewModel.js`：pool view-model 產生 + 通知 UI patch
- `tableDrag.js`：枱位拖拉 + 寫回 `table_settings/{tableNum}`

---

## 規劃中（下一步要做）

> 目標：令 `seatingEngine.js` 由 ~2.7k 行進一步落到 **1–2k**；同時將邏輯分層，避免單檔過度耦合。

### A) 抽離 guest drag（desktop/touch）+ sidebar drop/trash
- **預計拆出**：
  - `src/seating/engine/guestDrag.js`（或 `dragGuests.js`）
- **包含**：
  - `setupDesktopGuestDrag`
  - `setupTouchDrag`
  - `bindDragSidebarHandlers`
  - `handleDropTrash`（可拆成更細 helper）

### B) 抽離 print / print preview builder
- **預計拆出**：
  - `src/seating/engine/printPreview.js`
- **包含**：
  - print HTML builder（canvas/guest list）
  - print zoom / fit font / orientation 等 UI 互動

### C) 抽離 table view-model / 幾何計算（純函數化）
- **預計拆出**：
  - `src/seating/engine/tableViewModel.js`
  - `src/seating/engine/geometry.js`
- **包含**：
  - `getTableViewModel`
  - `getSeatLayout`、座位座標、hub ring SVG 等

### D) 把重覆的「Firebase persist / suppression」抽 helper
- 目標係減少 `suppressGuestRemoteRenderCount` / `suppressTableSettingsRemoteRenderCount` 類重覆樣板碼，降低 bug 面積。

---

## 注意事項 / Guardrails
- **VM 內嘅 guest 物件必須保留原始欄位**（`id/side/group/sort` 等），只可以疊加顯示用欄位；否則會出現：
  - modal 標籤缺失
  - side/來源判斷錯
  - drag/drop 找人失效（靠 `id`）

