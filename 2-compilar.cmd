@echo off
cd /d "%~dp0"
echo === La Fortaleza Radio: compilar la APK ===
if not defined JAVA_HOME if exist "C:\Program Files\Android\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
if not defined ANDROID_HOME if exist "%LOCALAPPDATA%\Android\Sdk" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not defined JAVA_HOME (echo. & echo No encuentro el Java de Android Studio. Instala Android Studio en la carpeta normal. & pause & exit /b 1)
if not defined ANDROID_HOME (echo. & echo No encuentro el SDK de Android. Abre Android Studio una vez y termina su asistente de instalacion. & pause & exit /b 1)
if not exist node_modules (echo. & echo Primero abre 1-preparar.cmd & pause & exit /b 1)
call npx cap sync android
if errorlevel 1 (echo. & echo Fallo cap sync. & pause & exit /b 1)
echo Compilando. La primera vez descarga herramientas y puede tardar 10 a 15 minutos; las siguientes, uno o dos.
echo No cierres esta ventana.
pushd android
call gradlew.bat assembleDebug > ..\compilar.log 2>&1
set FALLO=%ERRORLEVEL%
popd
if not "%FALLO%"=="0" (echo. & echo Fallo la compilacion. El detalle quedo en compilar.log: pasale ese archivo al chat de la radio. & echo. & findstr /i /c:"error" /c:"what went wrong" compilar.log & pause & exit /b 1)
copy /y android\app\build\outputs\apk\debug\app-debug.apk La-Fortaleza-Radio.apk >nul
echo.
echo Listo: La-Fortaleza-Radio.apk esta en esta carpeta. Pasala al telefono y al coche e instalala.
pause
