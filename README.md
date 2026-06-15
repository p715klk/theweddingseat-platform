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
| `/p/:slug` | 點名頁（公開） |
| `/p/:slug/admin` | 賓客後台（要登入） |
| `/p/:slug/seating` | 畫布排位（要登入，暫用 legacy iframe） |

## 建置與部署

```bash
npm run build
```

輸出喺 `dist/`。GitHub Pages：Settings → Pages → 部署 `dist` 資料夾（可用 GitHub Actions）。

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
