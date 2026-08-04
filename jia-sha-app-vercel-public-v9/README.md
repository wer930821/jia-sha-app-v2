# 呷啥 App — Vercel public 版

## GitHub 第一層結構

- `public/`：首頁、CSS、前端 JavaScript、PWA manifest
- `api/nearby.js`：OpenStreetMap 店家搜尋 API
- `vercel.json`：Vercel Function 設定

## Vercel 設定

- Framework Preset：Other
- Root Directory：空白（專案根目錄）
- Build Command：留白
- Output Directory：`public`
- Install Command：留白

不要保留舊的根目錄 `index.html`、`main.js`、`styles.css`、`package.json`、`app.js` 或 `server.js`。
