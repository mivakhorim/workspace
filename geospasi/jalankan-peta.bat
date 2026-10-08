@echo off
title DutaGeoSpasi - Web GIS & Server ATR/BPN
color 0b
echo ===================================================================
echo     DUTAGEOSPASI - SERVER WEB GIS & PROXY PETA ATR/BPN
echo     Domain Produksi : https://geospasi.dutamik.id
echo     Pengembang      : Duta Digital Agensi (dutamik.id)
echo     Tagline         : Duta Media Informasi berKarya
echo     Lokasi          : Sukoharjo, Jawa Tengah
echo ===================================================================
echo.
echo Sedang menyiapkan server lokal pada http://localhost:8085/ ...
echo Browser web Anda akan terbuka secara otomatis sebentar lagi.
echo.
echo [TIPS] Jangan tutup jendela ini selama Anda menggunakan peta.
echo.
cd /d "%~dp0"

where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [INFO] Menjalankan server performa tinggi Python...
    python "%~dp0server.py"
) else (
    echo [INFO] Python tidak terdeteksi, menjalankan server PowerShell...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
)

pause
