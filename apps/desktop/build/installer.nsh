; Instala o CLI do Gestor iFood junto com o Barbacue Pedidos: copia ifood.cmd
; para a pasta do programa e inclui essa pasta no PATH do usuário, para que
; "ifood" funcione em qualquer Prompt de Comando/PowerShell aberto depois.

!macro customInstall
  CopyFiles /SILENT "$INSTDIR\resources\cli\ifood.cmd" "$INSTDIR\ifood.cmd"
  nsExec::Exec `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$d = '$INSTDIR'; $$p = [Environment]::GetEnvironmentVariable('Path', 'User'); if (-not $$p) { $$p = '' }; if (($$p -split ';') -notcontains $$d) { [Environment]::SetEnvironmentVariable('Path', (($$p.TrimEnd(';') + ';' + $$d).TrimStart(';')), 'User') }"`
  Pop $0
!macroend

!macro customUnInstall
  Delete "$INSTDIR\ifood.cmd"
  nsExec::Exec `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$d = '$INSTDIR'; $$p = [Environment]::GetEnvironmentVariable('Path', 'User'); if ($$p) { [Environment]::SetEnvironmentVariable('Path', ((($$p -split ';') | Where-Object { $$_ -and $$_ -ne $$d }) -join ';'), 'User') }"`
  Pop $0
!macroend
