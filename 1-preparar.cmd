@echo off
cd /d "%~dp0"
echo === La Fortaleza Radio: preparar el proyecto (una sola vez) ===
where node >nul 2>nul || (echo. & echo Falta Node.js. Instala la version LTS desde https://nodejs.org y vuelve a abrir este archivo. & pause & exit /b 1)
echo Instalando Capacitor. Tarda uno o dos minutos...
call npm install
if errorlevel 1 (echo. & echo Fallo npm install. Toma foto de lo de arriba y pasala al chat de la radio. & pause & exit /b 1)
call npx cap sync android
if errorlevel 1 (echo. & echo Fallo cap sync. Toma foto de lo de arriba y pasala al chat de la radio. & pause & exit /b 1)
echo.
echo Listo. Ahora abre 2-compilar.cmd
pause
