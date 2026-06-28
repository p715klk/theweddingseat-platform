# 操作記錄（Audit Log）

後台 **設定 → 操作記錄**（第 4 個 tab）顯示專案內重要操作，方便 Owner / Super Admin 追查「邊個、幾時、喺邊個頁面、做咗咩」。

---

## 權限與 UI

| 項目 | 說明 |
|------|------|
| **可查看** | 專案 **Owner**、**Super Admin** |
| **不可查看** | Admin、Reception 等其他角色 |
| **位置** | 賓客後台 ⚙ 設定 → **操作記錄** |
| **每頁筆數** | 10 / 30 / 50 / 100（dropdown） |
| **欄位** | 時間、用戶（email）、頁面、操作、詳情 |

---

## 資料與 API

### PocketBase collection：`audit_logs`

| 欄位 | 說明 |
|------|------|
| `tenant_id` | 專案 ID |
| `user_id` | 操作者 UID |
| `user_email` | 操作者 Email |
| `page` | 頁面名稱（見下表） |
| `action` | 操作摘要 |
| `detail` | 補充說明（賓客名、枱號等） |
| `created_at` | Unix ms 時間戳 |

建立：`npm run setup:pocketbase`（會建立 collection 同 API rules）。

### Hooks 端點

| 端點 | 用途 |
|------|------|
| `POST /tws/write-audit-log` | 寫入一條記錄（任何已登入專案成員） |
| `POST /tws/list-audit-logs` | 分頁列出（只限 Owner / Super Admin） |

前端封裝：`src/lib/auditLog.js`、`src/lib/twsApi.js`（`callWriteAuditLog` / `callListAuditLogs`）。

---

## 頁面名稱（`page` 欄）

| 常數 | 顯示值 | 設定時機 |
|------|--------|----------|
| `AUDIT_PAGES.CHECKIN` | 點名 | `/p/{slug}` 點名頁 |
| `AUDIT_PAGES.GUESTLIST` | 賓客名單 | `/p/{slug}/admin` 後台 |
| `AUDIT_PAGES.SEATING` | 排位 | `/p/{slug}/seating` 畫布 |
| `AUDIT_PAGES.SETTINGS` | 設定 | 設定 dialog 內操作 |
| `AUDIT_PAGES.USERS` | 用戶管理 | 成員管理相關 |

各 View 載入時會呼叫 `setAuditPageContext({ tenantId, page })`，登入／登出記錄用同一個 page。

---

## 登入／登出規則

| 事件 | 是否記錄 | 說明 |
|------|----------|------|
| 輸入帳密登入成功 | ✅ 登入 | `useAuth.login()` 成功後寫入 |
| F5 / 重新開分頁 | ❌ | Session 自動還原，**唔**再寫登入 |
| 按登出 | ✅ 登出 | `useAuth.logout()` 前寫入 |
| 被踢出（非成員、改密碼後登出、閒置登出等） | ✅ 登出 | 同樣經 `logout()` |

設計目標：**一次手動登入配一次登出**，避免 F5 產生重複登入 record。

> Super Admin 喺 `/super` 登入若無 project context，唔會寫 project 級別嘅登入 record。

---

## 記錄範圍一覽

### 點名（`page = 點名`）

| 操作 | 詳情示例 | 程式位置 |
|------|----------|----------|
| 更新簽到狀態 | `陳大文（5桌）未到 → 已到` | `src/composables/useCheckIn.js` |
| 更新人情狀態 | `陳大文（5桌）未交 → 人情` | 同上 |
| 現場加座 | `陳大文（5桌，男方，現場加座）` | 同上 |

人情狀態循環：`未交` → `人情` → `送金器` → `電子人情` → `未交`  
簽到狀態循環：`未到` → `已到` → `取消` → `未到`

---

### 賓客名單（`page = 賓客名單`）

| 操作 | 詳情示例 | 備註 |
|------|----------|------|
| 新增賓客列 | `待填寫姓名（待儲存）` | 本地改動，需按儲存才同步 |
| 移除賓客 | `陳大文（待儲存）` | 同上 |
| 調整賓客順序 | `陳大文（待儲存）` | 同上 |
| 更改賓客枱號 | `陳大文 → 5（待儲存）` | 同上 |
| 更改賓客座位 | `陳大文 → 座位 3（待儲存）` | 同上 |
| 新增標籤 | 標籤名 | |
| 刪除標籤 | 標籤名 | |
| 儲存賓客 | `120 位賓客` | 按「儲存變更」同步後 |
| 匯入 CSV | `120 位賓客` | 匯入並儲存成功後 |

程式位置：`src/composables/useAdminGuests.js`

---

### 設定（`page = 設定`）

| 操作 | 詳情示例 | 備註 |
|------|----------|------|
| 匯出 CSV | `120 位賓客` | |
| 清空賓客 | `移除 120 位（待儲存）` | 需再儲存才同步 |
| 更改密碼 | （無） | 成功後會自動登出 |

程式位置：`useAdminGuests.js`、`AdminSettingsDialog.vue`

---

### 排位（`page = 排位`）

| 操作 | 詳情示例 |
|------|----------|
| 移動賓客 | `陳大文：3桌 → 5桌 座位2` |
| 移回待派池 | `陳大文（3桌）` |
| 編輯賓客 | `陳大文（5桌）` |
| 編輯賓客（待派池） | `陳大文` |
| 移除座位賓客 | `陳大文（5桌）→ 待派池` |
| 移動枱位置 | `5桌 → (120, 340)` |
| 新增枱 | `6桌（12 位）` |
| 更改枱設定 | `5桌：上限 12，標籤「主枱」` |
| 更改枱號 | `5桌 → 6桌` |
| 刪除枱 | `5桌（8 位移入待派池）` |
| 新增標籤 | 標籤名 |
| 刪除標籤 | 標籤名 |

程式位置：`src/seating/seatingEngine.js`

---

### 用戶管理（`page = 用戶管理`）

| 操作 | 詳情示例 | 寫入方式 |
|------|----------|----------|
| 建立新帳號 | `user@example.com（admin）` | 前端 |
| 加入現有帳號 | `user@example.com（reception）` | 前端（reuse email） |
| 變更角色 | `user@example.com → reception` | 前端 |
| 交換角色 | `a@x.com ↔ b@x.com` | 前端 |
| 更新顯示名稱 | 新名稱 | 前端（本人） |
| 更新成員顯示名稱 | 新名稱 | 前端（Owner 改他人） |
| 新增成員 | uid 或 display_name | **pb_hooks**（`upsert-member` 新建時） |
| 移除成員 | uid | **pb_hooks**（`remove-member`） |

程式位置：`src/composables/useTenantUsers.js`、`scripts/build-tws-hooks.mjs`（生成 hooks）

---

### 登入／登出（`page` = 目前所在頁）

| 操作 | 觸發 |
|------|------|
| 登入 | 提交帳密成功 |
| 登出 | 登出按鈕、被踢出、改密碼後登出、閒置登出等 |

程式位置：`src/composables/useAuth.js`、`src/lib/auditLog.js`

---

## 目前**不**記錄的操作

以下刻意唔寫 audit，避免噪音或技術上難以準確描述：

- 純瀏覽、搜尋、展開／收合 UI
- F5、路由切換（session 仍有效）
- Realtime 同步收到他人改動（只記操作者本人嘅寫入）
- Super Admin `/super` 平台層操作（非單一 project context）
- 賓客名單本地改動未按「儲存變更」前，部分操作會標示 `（待儲存）`，但**唔**會寫「儲存失敗」

---

## 部署

1. `npm run setup:pocketbase` — 建立／更新 `audit_logs` collection  
2. `npm run build:tws-hooks` — 生成含 `list-audit-logs` / `write-audit-log` 嘅 hooks  
3. 複製 `pocketbase/pb_hooks/` → NAS `pb_data/pb_hooks/`  
4. Push 前端（GitHub Pages）

驗證：`GET /tws/health` 應載入 hooks；Owner 開設定應見「操作記錄」tab。

---

## 相關檔案

| 檔案 | 用途 |
|------|------|
| `src/lib/auditLog.js` | 寫入／讀取、登入登出、page 常數 |
| `src/components/admin/AuditLogPanel.vue` | 設定 tab UI |
| `src/components/admin/AdminSettingsDialog.vue` | 第 4 tab 入口 |
| `scripts/setup-pocketbase.mjs` | DB schema |
| `scripts/build-tws-hooks.mjs` | hooks 路由來源 |
