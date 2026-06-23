# PocketBase 遷移指南

## 1. NAS 部署 PocketBase hooks

將本 repo 的 `pocketbase/pb_hooks/tws.pb.js` 複製到 NAS Docker 掛載的 `pb_hooks/` 目錄，然後重啟 PocketBase。

自訂 API（需登入）：

| 端點 | 用途 |
|------|------|
| `POST /api/tws/create-user` | Owner / Super Admin 建立帳號（唔會搶 session） |
| `POST /api/tws/remove-member` | 移除成員 + 條件刪除 Auth 帳號 |
| `POST /api/tws/set-password` | Super Admin 重設密碼 |

## 2. 初始化 Collections

```bash
# .env.local 填入 POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD
npm run setup:pocketbase
```

會建立：`tenants`、`tenant_data`、`tenant_members`，並擴展 `users` auth collection 欄位說明。

## 3. 設定 Super Admin

在 PocketBase Admin → `users` → 你的帳號 → 勾選 `is_platform_admin = true`。

## 4. 前端環境變數

`.env.local`：

```
VITE_POCKETBASE_URL=http://kin9310.myqnapcloud.com:8090
```

## 5. 從 Firebase 匯入舊資料（可選）

若仍有 Firebase 資料要搬：

```bash
# 暫時加返 Firebase 變數到 .env.local
VITE_FIREBASE_DATABASE_URL=...
VITE_FIREBASE_API_KEY=...
node scripts/migrate-firebase-to-pocketbase.mjs
```

## 6. 架構對照

| Firebase RTDB | PocketBase |
|---------------|------------|
| `slugs/{slug}` | `tenants.slug` → `tenants.tenant_id` |
| `tenants/{id}/meta` | `tenants` collection |
| `tenants/{id}/members` | `tenant_members` |
| `tenants/{id}/user_profiles` | `tenant_members`（合併 profile 欄位） |
| `tenants/{id}/wedding_guests` 等 | `tenant_data` JSON 欄位 |
| `platform_admins/{uid}` | `users.is_platform_admin` |
| Firebase Auth | PocketBase Auth (`users`) |
| Cloud Functions | `pb_hooks/tws.pb.js` |

## 7. HTTPS 建議

GitHub Pages 係 HTTPS，若 PocketBase 用 HTTP 可能有 mixed-content 問題。建議用 Cloudflare Tunnel 或 NAS 反向代理加 SSL。

## 8. Legacy HTML

`public/legacy/` 仍使用 Firebase CDN，尚未遷移。主應用（Vue `/p/{slug}/*`）已完全改用 PocketBase。
