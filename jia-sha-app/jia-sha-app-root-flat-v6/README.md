# 呷啥（OpenStreetMap 免費版 v1.1）

功能：
- 走路、騎車、開車切換
- 0.3～20 公里自由距離
- 預算可輸入，或選擇「無上限」
- 強化早餐分類（店名、品牌、cuisine 標籤與麵包店）
- Vercel Serverless API 查詢 OpenStreetMap Overpass

## Vercel
Framework Preset 選 Other，Root Directory 指向此資料夾，不需要環境變數。

## 更新 GitHub
將本資料夾內全部檔案上傳並覆蓋舊檔，再等待 Vercel 自動重新部署。


## v1.2 修正
- 多個 Overpass 服務改為平行查詢，使用最快回應。
- 搜尋逾時縮短，避免 Vercel Function 在結果回來前被中止。
