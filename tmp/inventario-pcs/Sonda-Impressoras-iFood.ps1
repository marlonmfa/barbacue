# Sonda somente-leitura: impressoras (via CIM/registro, sem Get-Printer) e conta do Gestor de Pedidos iFood.
$ErrorActionPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
function T($sb, $sec = 25) { $j = Start-Job $sb; if (Wait-Job $j -Timeout $sec) { Receive-Job $j } else { "  (TEMPO ESGOTADO apos ${sec}s)"; Stop-Job $j }; Remove-Job $j -Force }
"##### $env:COMPUTERNAME"
"=== IMPRESSORAS (Win32_Printer)"
T { Get-CimInstance Win32_Printer | ForEach-Object { "{0} | porta {1} | driver {2} | status {3} | offline {4} | erro {5} | padrao {6} | compart. {7}" -f $_.Name, $_.PortName, $_.DriverName, $_.PrinterStatus, $_.WorkOffline, $_.DetectedErrorState, $_.Default, $_.ShareName } }
"=== PORTAS TCP/IP"
T { Get-CimInstance Win32_TCPIPPrinterPort | ForEach-Object { "{0} -> {1}:{2}" -f $_.Name, $_.HostAddress, $_.PortNumber } }
T { Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Print\Monitors\Standard TCP/IP Port\Ports' | ForEach-Object { $p = Get-ItemProperty $_.PSPath; "  reg: $($_.PSChildName) -> $($p.HostName)$($p.IPAddress):$($p.PortNumber)" } }
"=== TESTE DE CONEXAO (impressoras de rede)"
$addrs = @(Get-CimInstance Win32_TCPIPPrinterPort | ForEach-Object { "$($_.HostAddress):$(if ($_.PortNumber) { $_.PortNumber } else { 9100 })" })
foreach ($p in Get-CimInstance Win32_Printer) { if ($p.PortName -match '(\d{1,3}(\.\d{1,3}){3})') { $addrs += "$($Matches[1]):9100" } }
foreach ($a in ($addrs | Sort-Object -Unique)) {
  $h, $port = $a -split ':'; $tcp = New-Object Net.Sockets.TcpClient
  $ok = try { $tcp.ConnectAsync($h, [int]$port).Wait(2500) } catch { $false }; $tcp.Close()
  $ping = (New-Object Net.NetworkInformation.Ping).Send($h, 1500).Status
  "  $a -> TCP $(if ($ok) {'OK'} else {'FALHOU'}) | ping $ping"
}
"=== USB / PnP de impressao"
T { Get-PnpDevice -PresentOnly:$false | Where-Object { $_.Class -eq 'Printer' -or $_.FriendlyName -match '(?i)elgin|epson|bematech|daruma|pos-?80|pos-?58|tm-t|i9|i8|i7|termica|thermal|knup|tanca|sweda' -or $_.InstanceId -match '^USBPRINT' } | ForEach-Object { "  [$($_.Status)] $($_.Class) | $($_.FriendlyName) | $($_.InstanceId)" } } 40
"=== FILA"
T { Get-CimInstance Win32_PrintJob | ForEach-Object { "  $($_.Name) | $($_.Document) | $($_.JobStatus) | $($_.TimeSubmitted)" } }
"=== ERROS PrintService (ultimos 10)"
T { Get-WinEvent -LogName 'Microsoft-Windows-PrintService/Admin' -MaxEvents 10 | ForEach-Object { "  $($_.TimeCreated) [$($_.Id)] $(($_.Message -split "`n")[0])" } }
"=== GESTOR DE PEDIDOS: pastas de dados"
$cands = Get-ChildItem "$env:APPDATA","$env:LOCALAPPDATA" -Directory -Force | Where-Object { $_.Name -match '(?i)ifood|gestor|order.?manager|merchant' }
$cands | ForEach-Object { "  $($_.FullName) (modif. $($_.LastWriteTime))" }
"=== GESTOR DE PEDIDOS: lojas/contas encontradas"
foreach ($d in $cands) {
  $files = Get-ChildItem $d.FullName -Recurse -File -Force | Where-Object { $_.Length -lt 30MB -and $_.FullName -match '(?i)Local Storage|IndexedDB|Session Storage|\.json$|\.log$|Preferences' } | Sort-Object LastWriteTime -Descending | Select-Object -First 200
  $found = @{}
  foreach ($f in $files) {
    $tmp = "$env:TEMP\sonda_$([guid]::NewGuid()).bin"; Copy-Item $f.FullName $tmp -Force
    $raw = try { [IO.File]::ReadAllText($tmp, [Text.Encoding]::GetEncoding(28591)) } catch { '' }; Remove-Item $tmp -Force
    $raw = $raw -replace '\x00', ''
    foreach ($m in [regex]::Matches($raw, '(?i)"(merchantName|merchant_name|name|tradingName|corporateName|fantasyName|merchantId|merchant_id|username|email)"\s*:\s*"[^"]{2,90}"')) {
      $v = $m.Value; if ($v -match '(?i)barba|chelas|merchant|@|trading|corporate|fantasy' -and -not $found.ContainsKey($v)) { $found[$v] = $f.Name }
    }
    foreach ($m in [regex]::Matches($raw, '(?i).{0,50}(barbacue|barbadog|barba dog|chelas|lanches do barba).{0,50}')) { $v = ($m.Value -replace '[^\x20-\x7EÀ-ÿ]', ' ' -replace '\s+', ' ').Trim(); if (-not $found.ContainsKey($v)) { $found[$v] = $f.Name } }
  }
  $found.Keys | Select-Object -First 40 | ForEach-Object { "  $_   [$($found[$_])]" }
}
"=== FIM"
