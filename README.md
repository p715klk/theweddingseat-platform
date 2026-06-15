# The Wedding Seat Platform

婚宴帶位／點名 SaaS 平台版（多租戶）。

- **舊 repo**（個人婚禮）：保留 `wedding-seatern` Firebase，唔好同呢個混用
- **呢個 repo**：連 `theweddingseat-prod` Firebase，客戶資料放 `tenants/{slug}/...`

## 本地開發

用靜態 server 開 `index.html?slug=demo`（預設 slug 為 `demo`）。

## Firebase

- Project：`theweddingseat-prod`
- RTDB region：`asia-southeast1`
- Config：`js/firebase_config.js`

路線圖見 [docs/BUSINESS_ROADMAP.md](docs/BUSINESS_ROADMAP.md)。
