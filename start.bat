@echo off
cd /d "%~dp0"

set FIRST=0
if not exist .env (
  copy .env.example .env >nul
  set FIRST=1
)

if not exist node_modules call pnpm install || exit /b 1

docker compose -f infra/docker/compose.dev.yml up -d || exit /b 1
echo Menunggu Postgres siap...
timeout /t 8 /nobreak >nul

rem Seed demo hanya saat pertama kali (reset menghapus data)
if "%FIRST%"=="1" (
  call pnpm --filter api db:reset:demo || exit /b 1
) else (
  call pnpm db:migrate || exit /b 1
)

start "2M Worker" cmd /k "pnpm --filter api worker"

echo.
echo API:         http://localhost:3000
echo Courier PWA: http://localhost:5173
echo Admin web:   http://localhost:5174
echo Customer:    http://localhost:5175
echo MinIO:       http://localhost:9001  (minioadmin / minioadmin)
echo.
pnpm dev
