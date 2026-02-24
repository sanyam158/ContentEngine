# Script 2 Thread - Windows PowerShell Start Script
# Run: powershell -ExecutionPolicy Bypass -File start-dev.ps1

Write-Host "`n╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       Script 2 Thread - Windows PowerShell Start           ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js not found. Install from https://nodejs.org" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check .env
if (-Not (Test-Path "backend\.env")) {
    Write-Host "`n⚠️  .env file not found!" -ForegroundColor Yellow
    Write-Host "Create it with: copy backend\.env.example backend\.env`n" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Install dependencies
Write-Host "`n📦 Installing dependencies...`n" -ForegroundColor blue

if (-Not (Test-Path "backend\node_modules")) {
    Write-Host "  Installing backend dependencies..." -ForegroundColor Gray
    Set-Location backend
    npm install | Out-Null
    Set-Location ..
}

if (-Not (Test-Path "frontend\node_modules")) {
    Write-Host "  Installing frontend dependencies..." -ForegroundColor Gray
    Set-Location frontend
    npm install | Out-Null
    Set-Location ..
}

Write-Host "`n✓ Dependencies installed`n" -ForegroundColor Green

# Create uploads directory
if (-Not (Test-Path "backend\uploads")) {
    New-Item -ItemType Directory -Path "backend\uploads" | Out-Null
}

# Start servers
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       Starting Development Servers                         ║" -ForegroundColor Cyan
Write-Host "╠════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║ Backend:  http://localhost:5000                            ║" -ForegroundColor Cyan
Write-Host "║ Frontend: http://localhost:3000                            ║" -ForegroundColor Cyan
Write-Host "║                                                            ║" -ForegroundColor Cyan
Write-Host "║ Close this window to stop both servers                    ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

Write-Host "Starting backend server..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit -Command", "cd backend; npm run dev" -WindowStyle Normal

Write-Host "Waiting for backend to start..." -ForegroundColor Gray
Start-Sleep -Seconds 3

Write-Host "Starting frontend server..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit -Command", "cd frontend; npm run dev" -WindowStyle Normal

Start-Sleep -Seconds 3

Write-Host "`n✓ Both servers started!" -ForegroundColor Green
Write-Host "✓ Opening http://localhost:3000 in your browser...`n" -ForegroundColor Green

# Open browser
Start-Process "http://localhost:3000"

Write-Host "Tips:" -ForegroundColor Cyan
Write-Host "  - Check dev tools (F12) for any errors" -ForegroundColor Gray
Write-Host "  - Backend logs in backend window" -ForegroundColor Gray
Write-Host "  - Frontend logs in frontend window" -ForegroundColor Gray
Write-Host "  - Ctrl+C in windows to stop servers" -ForegroundColor Gray
Write-Host ""

Read-Host "Press Enter to keep this window open"
