@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 找不到 Node.js，請先安裝 Node.js 18 以上版本。
  pause
  exit /b 1
)
if "%GOOGLE_PLACES_API_KEY%"=="" (
  echo 尚未設定 GOOGLE_PLACES_API_KEY。
  echo 測試方式：先執行 set GOOGLE_PLACES_API_KEY=你的金鑰
  echo 再重新執行 start.bat。
  pause
  exit /b 1
)
start "" http://localhost:8000
node server.js
