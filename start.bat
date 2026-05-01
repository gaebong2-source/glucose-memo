@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo === 혈당 메모 로컬 서버 시작 ===
echo.
echo 브라우저에서 http://localhost:5173 으로 접속하세요.
echo 서버를 끄려면 이 창을 닫거나 Ctrl+C 를 누르세요.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
echo.
echo === 서버가 종료되었습니다 ===
pause
