# Sonda 2 somente-leitura, sem tocar no spooler: impressoras via registro/PnP, eventos, e contas do Gestor de Pedidos.
$ErrorActionPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
function T($sb, $sec = 30) { $j = Start-Job $sb; if (Wait-Job $j -Timeout $sec) { Receive-Job $j } else { "  (TEMPO ESGOTADO apos ${sec}s)"; Stop-Job $j }; Remove-Job $j -Force }
"##### $env:COMPUTERNAME"
"=== SPOOLER"
$s = Get-CimInstance Win32_Service -Filter "Name='Spooler'"; "  estado $($s.State) | PID $($s.ProcessId)"
$sp = Get-Process -Id $s.ProcessId; "  spoolsv iniciado $($sp.StartTime) | CPU $([math]::Round($sp.CPU,1))s | memoria $([math]::Round($sp.WorkingSet64/1MB)) MB | threads $($sp.Threads.Count)"
"  arquivos na pasta de spool: $((Get-ChildItem C:\Windows\System32\spool\PRINTERS -Force | Measure-Object).Count)"
Get-ChildItem C:\Windows\System32\spool\PRINTERS -Force | ForEach-Object { "    $($_.Name) $($_.Length) bytes $($_.LastWriteTime)" }
"=== IMPRESSORAS (registro)"
Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Print\Printers' | ForEach-Object {
  $p = Get-ItemProperty $_.PSPath; "  $($_.PSChildName) | porta $($p.Port) | driver $($p.'Printer Driver') | compart. $($p.'Share Name')" }
"  padrao do usuario: $((Get-ItemProperty 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Windows').Device)"
"=== PORTAS"
Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Print\Monitors' | ForEach-Object { "  monitor: $($_.PSChildName)" }
Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Print\Monitors\Standard TCP/IP Port\Ports' | ForEach-Object { $p = Get-ItemProperty $_.PSPath; "  tcp: $($_.PSChildName) -> $($p.HostName)$($p.IPAddress):$($p.PortNumber)" }
"=== DISPOSITIVOS USB DE IMPRESSAO (PnP)"
T { Get-PnpDevice | Where-Object { $_.InstanceId -match '^USBPRINT|^USB\\VID_(20D1|0416|0519|04B8|0DD4|1504|28E9|0FE6|154F)' -or $_.Class -eq 'Printer' -or $_.FriendlyName -match '(?i)elgin|epson|bematech|daruma|pos-?80|pos-?58|tm-t|termica|thermal|knup|tanca|sweda|hprt|printer' } | ForEach-Object { "  [$($_.Status)] $($_.Class) | $($_.FriendlyName) | $($_.InstanceId)" } }
"=== ERROS PrintService (ultimos 12)"
T { Get-WinEvent -LogName 'Microsoft-Windows-PrintService/Admin' -MaxEvents 12 | ForEach-Object { "  $($_.TimeCreated) [$($_.Id)] $(($_.Message -split "`n")[0])" } }
T { Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Service Control Manager'} -MaxEvents 200 | Where-Object { $_.Message -match '(?i)spooler|spool' } | Select-Object -First 5 | ForEach-Object { "  SYS $($_.TimeCreated) [$($_.Id)] $(($_.Message -split "`n")[0])" } }
"=== GESTOR DE PEDIDOS: pastas de dados"
$cands = Get-ChildItem "$env:APPDATA","$env:LOCALAPPDATA" -Directory -Force | Where-Object { $_.Name -match '(?i)ifood|gestor|order.?manager|merchant' }
$cands | ForEach-Object { "  $($_.FullName) (modif. $($_.LastWriteTime))" }
"=== GESTOR DE PEDIDOS: lojas/contas encontradas"
foreach ($d in $cands | Where-Object { $_.Name -match '(?i)gestor de pedidos' }) {
  $files = Get-ChildItem $d.FullName -Recurse -File -Force | Where-Object { $_.Length -lt 30MB -and $_.FullName -match '(?i)\\Local Storage\\|\\Session Storage\\|\.json$|Preferences$' } | Sort-Object LastWriteTime -Descending | Select-Object -First 60
  $found = @{}
  foreach ($f in $files) {
    $tmp = "$env:TEMP\sonda_$([guid]::NewGuid()).bin"; Copy-Item $f.FullName $tmp -Force
    $raw = try { [IO.File]::ReadAllText($tmp, [Text.Encoding]::GetEncoding(28591)) } catch { '' }; Remove-Item $tmp -Force
    $raw = $raw -replace '\x00', ''
    foreach ($m in [regex]::Matches($raw, '(?i)"(merchantName|merchant_name|tradingName|corporateName|fantasyName|merchantId|merchant_id|displayName|name)"\s*:\s*"[^"]{2,90}"')) {
      $v = $m.Value; if ($v -match '(?i)barba|chelas|merchant|trading|corporate|fantasy' -and $v -notmatch '(?i)printer|font|\.js' -and -not $found.ContainsKey($v)) { $found[$v] = $f.Name } }
    foreach ($m in [regex]::Matches($raw, '(?i).{0,50}(barbacue|barbadog|barba dog|chelas|lanches do barba|hot ?dog do barba).{0,50}')) { $v = ($m.Value -replace '[^\x20-\x7E\u00C0-\u00FF]', ' ' -replace '\s+', ' ').Trim(); if (-not $found.ContainsKey($v)) { $found[$v] = $f.Name } }
  }
  $found.Keys | Select-Object -First 40 | ForEach-Object { "  $_   [$($found[$_])]" }
}
"=== FIM"
