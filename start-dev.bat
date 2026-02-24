@echo off
REM Script 2 Thread - Quick Start for Windows
REM This script installs dependencies and starts both servers

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║       Script 2 Thread - Windows Quick Start                ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed
    echo Please install Node.js 18 or later from https://nodejs.org
    pause
    exit /b 1
)

echo ✓ Node.js found: 
node --version

REM Check for .env file
if not exist "backend\.env" (
    echo.
    echo ⚠️  .env file not found!
    echo.
    echo Please create backend/.env with your API keys
    echo Copy the template: copy backend\.env.example backend\.env
    echo.
    pause
    exit /b 1
)

echo.
echo 📦 Installing dependencies (this may take a few minutes)...
echo.

REM Install backend dependencies
if not exist "backend\node_modules" (
    echo   Installing backend dependencies...
    cd backend
    call npm install
    cd ..
)

REM Install frontend dependencies  
if not exist "frontend\node_modules" (
    echo   Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

echo.
echo ✓ Dependencies installed
echo.

REM Create uploads directory
if not exist "backend\uploads" (
    mkdir backend\uploads
    echo ✓ Created upload directory
)

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║       Starting Development Servers                         ║
echo ╠════════════════════════════════════════════════════════════╣
echo ║ Backend:  http://localhost:5000                            ║
echo ║ Frontend: http://localhost:3000                            ║
echo ║                                                            ║
echo ║ Opening frontend in browser...                            ║
echo ║ Close terminal windows to stop servers                    ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM Start backend
echo Starting backend server...
start "Script 2 Thread - Backend" cmd /k "cd backend && npm run dev"

REM Wait a moment
timeout /t 3 /nobreak

REM Start frontend
echo Starting frontend...
start "Script 2 Thread - Frontend" cmd /k "cd frontend && npm run dev"

REM Wait a moment more
timeout /t 3 /nobreak

REM Try to open in browser
echo.
echo ✓ Both servers started!
echo ✓ Opening http://localhost:3000 in your browser...
echo.

start http://localhost:3000

echo.
echo 📝 Tips:
echo - If port already in use, edit backend/.env and change PORT
echo - Check browser console (F12) for any errors
echo - Backend logs appear in backend terminal
echo - Frontend logs appear in frontend terminal
echo.

pause
