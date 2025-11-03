@echo off
title 🚀 Ejecutando API Node.js (MQTT + MongoDB)
color 0A
echo -----------------------------------------------
echo    Iniciando tu API de Node.js (Brody Edition)
echo -----------------------------------------------

:: Verificar si el archivo principal existe
if not exist "app.js" (
    echo ❌ ERROR: No se encuentra "app.js".
    pause
    exit /b
)



:: Evitar que la terminal se cierre
echo.
echo ⚠️ La API se ha detenido. Presiona cualquier tecla para salir...
pause >nul