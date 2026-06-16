# The Wedding Seat Platform (Vue 3)

婚宴帶位／點名 SaaS 平台版（多租戶）。

## 技術棧

- **Vue 3** + **Vite** + **Vue Router**
- **Firebase** RTDB + Auth

## 開發

```bash
npm install
npm run dev
```

開啟 `http://localhost:5173/p/demo`

| 路由 | 頁面 |
|------|------|
| `/p/:slug` | 點名頁（預設公開；可用 `VITE_FRONTEND_REQUIRE_LOGIN=true` 變成需登入） |
| `/p/:slug/admin` | 賓客後台（Vue，要登入） |
| `/p/:slug/seating` | 畫布排位（要登入，暫用 legacy iframe） |
| `/super` | 平台 Super Admin（開客戶 project） |

## 建置與部署

```bash
npm run build
```

輸出喺 `dist/`。`npm run build` 會自動複製 `404.html` 做 SPA fallback。

### GitHub Pages（建議）

1. Repo → **Settings** → **Pages** → **Build and deployment** → Source 揀 **GitHub Actions**
2. Repo → **Settings** → **Secrets and variables** → **Actions**，加入：

| Secret | 說明 |
|--------|------|
| `VITE_FIREBASE_API_KEY` | Firebase Web apiKey |
| `VITE_FIREBASE_AUTH_DOMAIN` | 例如 `theweddingseat-prod.firebaseapp.com` |
| `VITE_FIREBASE_DATABASE_URL` | RTDB URL |
| `VITE_FIREBASE_PROJECT_ID` | 例如 `theweddingseat-prod` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Web app ID |
| `VITE_FIREBASE_MEASUREMENT_ID` | （選填）Analytics |

3. Push 去 `main` → Actions workflow `Deploy GitHub Pages` 會自動 build + deploy
4. 網址：`https://<username>.github.io/<repo-name>/p/demo`
5. Firebase Console → Authentication → **Authorized domains** 加 `*.github.io`

本地模擬 GitHub Pages 路徑：

```bash
# PowerShell
$env:BASE_PATH="/theweddingseat-platform/"; npm run build; npm run preview
```

`database.rules.json` 貼去 Firebase Console → Rules → Publish。

## 專案結構

```
src/
  views/          CheckInView, AdminView, SeatingView
  composables/    useTenant, useAuth, useCheckIn, useAdminGuests
  firebase.js     Firebase 初始化
legacy/           舊版靜態 HTML（參考用）
public/legacy/    畫布 iframe 用舊版 seating
```

舊版靜態檔已移至 `legacy/`。畫布排位下一步會完全遷移成 Vue component。

路線圖見 [docs/BUSINESS_ROADMAP.md](docs/BUSINESS_ROADMAP.md)。
