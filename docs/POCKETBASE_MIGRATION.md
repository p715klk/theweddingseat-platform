# PocketBase 遷移指南



## 1. NAS 部署 PocketBase hooks（必須）



Owner / Super Admin 建帳、成員 CUD、移除成員等操作經 **`pb_hooks/`**，唔可以只靠 collection API rules。

部署時要複製 **整個** `pocketbase/pb_hooks/` 資料夾（至少包含）：

| 檔案 | 用途 |
|------|------|
| `tws_routes.pb.js` | HTTP routes（`create-user`、`upsert-member`、`swap-member-roles` 等；由 `npm run build:tws-hooks` 生成） |
| `tws.pb.js` | record hooks（刪 tenant cascade、auto-verify） |

> **勿** 放 `00_health.pb.js` 等 stub 覆蓋 `tws_routes.pb.js` 內嘅 `/tws/health`。

| 端點 | 用途 |
|------|------|
| `GET /tws/health` | 檢查 hooks 是否載入（version 應為 **34+**） |
| `POST /tws/create-user` | Super Admin 或 Owner 建 Auth 帳號 |
| `POST /tws/list-members` | Owner / Admin 列出成員（含 email、display_name） |
| `POST /tws/upsert-member` | 新增／更新 `tenant_members`（含配額檢查） |
| `POST /tws/swap-member-roles` | 兩位成員 admin ↔ reception 交換角色（滿額時用） |
| `POST /tws/update-member-profile` | Owner 改他人 profile；本人可改自己 |
| `POST /tws/remove-member` | 移除成員 + 條件刪除 orphan `users` |
| `POST /tws/set-password` | Super Admin 重設他人密碼 |



## 2. 初始化 Collections



```bash

# .env.local 填入 POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD

npm run setup:pocketbase

```



會建立／更新：`tenants`、`tenant_data`、`tenant_members`，並擴展 `users` auth collection 欄位與 API rules。



## 3. RBAC 與 API Rules



`npm run setup:pocketbase` 會設定：



| Collection | list / view | create / update / delete |

|------------|-------------|--------------------------|

| `users` | 本人或 Super Admin | create：Super Admin only（實際建帳走 hook）；update：本人或 Super Admin |

| `tenants` | Super Admin、Owner、該 project 成員 | create/delete：Super Admin；update：Super Admin 或 Owner |

| `tenant_members` | Super Admin、本人、該 project Owner | **全部 Super Admin only**（Owner 經 `upsert-member` / `remove-member` hook） |

| `tenant_data` | Super Admin、該 project 成員（`&&` 失敗時 fallback 為任何登入者） | create/delete：Super Admin；update：Super Admin 或成員 |



**建帳號：** `createAuthUserViaRest` → `POST /tws/create-user`（見 `src/lib/twsApi.js`）。  

**加／改成員：** `callUpsertTenantMember` → `POST /tws/upsert-member`。  

**交換角色：** `callSwapTenantMemberRoles` → `POST /tws/swap-member-roles`。  

**改 profile：** `callUpdateMemberProfile` → `POST /tws/update-member-profile`。

### 成員配額（每個 project）

| 角色 | 上限 | 說明 |
|------|------|------|
| Owner | 1 | 不可移除自己；角色不可經 UI 改動 |
| 後台管理員（admin） | 3 | 可進 `/p/{slug}/admin` |
| 現場接待（reception） | 6 | 只可點名頁 |
| **合計** | **10** | 含 Owner |

實作：`src/lib/tenantMemberLimits.js`；後端 `upsert-member` / `swap-member-roles` 強制檢查（`npm run build:tws-hooks` 生成）。

| 操作者 | 配額行為 |
|--------|----------|
| **Owner** | 受上限約束；名額滿時**不可新增**；可改角色；若 admin 與 reception **兩邊都滿**，可用「**交換角色**」 |
| **Super Admin** | **不受配額限制**（`is_platform_admin` bypass）；仍可新增／改角色 |

**滿額時改角色（Owner）：**

1. 若目標角色尚有名額 → 編輯選單「設為後台管理員／現場接待」
2. 若 3 admin + 6 reception 全滿（單向改會超額）→ 編輯選單「與 XXX 交換角色」（admin ↔ reception，人數不變）
3. 若曾超額（例如 4/3 admin）→ 將多餘 admin 改做 reception 修正

UI：`src/components/admin/AdminSettingsDialog.vue`（用戶管理 tab — 表格 + 編輯選單）。

修復舊資料 relation：`node scripts/repair-tenant-member-relations.mjs`  
遷移 owner 至 join table：`node scripts/migrate-owner-to-members.mjs`



## 4. 設定 Super Admin



在 PocketBase Admin → `users` → 你的帳號 → 勾選 `is_platform_admin = true`。



## 5. 前端環境變數



`.env.local`：



```

VITE_POCKETBASE_URL=http://kin9310.myqnapcloud.com:8090

```



## 6. 從 Firebase 匯入舊資料（可選）



若仍有 Firebase 資料要搬：



```bash

# 暫時加返 Firebase 變數到 .env.local

VITE_FIREBASE_DATABASE_URL=...

VITE_FIREBASE_API_KEY=...

node scripts/migrate-firebase-to-pocketbase.mjs

```



## 7. 用戶與權限（DB 模型）



```

users                 → 登入身份 + 平台標記 + profile 備註

tenants.owner_uid     → 邊個係 Owner（可轉讓）

tenant_members        → 邊個 user 屬於邊個 project、role（owner / admin / reception）

```



| 欄位 / 概念 | 存放位置 |

|-------------|----------|

| email、password | `users`（Auth） |

| Super Admin | `users.is_platform_admin` |

| 顯示名、初始密碼記錄 | `users.display_name`、`users.initial_password` |

| Owner | `tenant_members.role = 'owner'`（`tenants.owner_uid` 為 legacy／顯示用） |

| Project admin / Reception | `tenant_members.role`（`admin` / `reception`） |



前端仍用 Firebase 路徑 `tenants/{id}/user_profiles/{uid}`；PocketBase 層會讀寫 **`users`**，唔再複製去 `tenant_members`。



### RTDB 路徑對照



| Firebase RTDB | PocketBase |

|---------------|------------|

| `slugs/{slug}` | `tenants.slug` → `tenants.tenant_id` |

| `tenants/{id}/meta` | `tenants` collection |

| `tenants/{id}/members` | `tenant_members`（`tenant_id`, `user_id`, `role`） |

| `tenants/{id}/user_profiles` | **`users`**（profile 欄位） |

| `tenants/{id}/wedding_guests` 等 | `tenant_data` JSON 欄位 |

| `platform_admins/{uid}` | `users.is_platform_admin` |

| Firebase Auth | PocketBase Auth (`users`) |

| Cloud Functions | `pb_hooks/tws_routes.pb.js` + `tws.pb.js` |



> 舊版 `tenant_members` 若仍有 `email` / `display_name` 等欄位可喺 Admin 手動刪除；新 `setup:pocketbase` 唔再建立呢啲欄位。



## 8. GitHub Pages 上線（HTTPS）



GitHub Pages 係 **HTTPS**，瀏覽器會 **封鎖** 對 `http://...` API 嘅請求（mixed content）。  

本機 `http://localhost` 可以連 HTTP NAS，但 **p715klk.github.io 唔得**。



### 必須做



1. **俾 PocketBase 一個 HTTPS 網址**（揀其一）：

   - QNAP 反向代理 + Let's Encrypt 憑證

   - [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)（免費，適合家用 NAS）

2. **PocketBase Admin → Settings → Application → Allowed origins** 加入：

   ```

   https://p715klk.github.io

   ```

3. **GitHub repo → Settings → Secrets → Actions** 設：

   - `VITE_POCKETBASE_URL` = 你嘅 **HTTPS** PocketBase 網址（例如 `https://pb.example.com`）

4. 重新跑 **Deploy GitHub Pages** workflow



### 點樣確認係 mixed content



瀏覽器 F12 → Console 會見類似：

`Mixed Content: The page at 'https://...' was loaded over HTTPS, but requested an insecure resource 'http://...'`



### QNAP 反向代理（概念）



```

https://kin9310.myqnapcloud.com:443/pb  →  http://127.0.0.1:8090

```



然後 `VITE_POCKETBASE_URL=https://kin9310.myqnapcloud.com/pb`（實際 path 視你 NAS 設定）。



## 9. HTTPS 建議（本機開發）



本機開發仍可用 `http://kin9310.myqnapcloud.com:8090`。只有部署到 HTTPS 網站先需要 HTTPS 後端。



## 10. Legacy HTML



`public/legacy/` 仍使用 Firebase CDN，尚未遷移。主應用（Vue `/p/{slug}/*`）已完全改用 PocketBase。

