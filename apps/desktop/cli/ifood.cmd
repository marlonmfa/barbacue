@echo off
setlocal
rem CLI do Gestor iFood: usa o Electron do Barbacue Pedidos como Node.
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0Barbacue Pedidos.exe" "%~dp0resources\cli\ifood.mjs" %*
exit /b %ERRORLEVEL%
