# Inventario somente-leitura de um PC Windows (programas, arquivos, iFood, loja, impressoras).
# Nao altera nada na maquina. Saida em texto no stdout.
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$KW = 'barbacue|barba\s?cue|barbadog|barba\s?dog|chelas'
$POS = 'ifood|gestor de pedidos|saipos|anota|goomer|consumer|aiqfome|99food|rappi|keeta|whatsapp|pdv|nfc|sat|bematech|elgin|epson|daruma|control ?id|tef|sitef|cielo|stone|pagseguro|getnet|tanca|sweda|gertec|qz tray|printnode|anydesk|teamviewer|rustdesk|tailscale|wireguard'
function H($t) { "`n==================== $t ====================" }
function Snips($text, $re, $max = 15) {
  $out = @{}
  foreach ($m in [regex]::Matches($text, "(?i).{0,70}($re).{0,70}")) {
    $s = ($m.Value -replace '[^\x20-\x7E\u00C0-\u00FF]', ' ' -replace '\s+', ' ').Trim()
    if ($s.Length -gt 8) { $out[$s] = 1 }
    if ($out.Count -ge $max) { break }
  }
  $out.Keys
}

H 'IDENTIFICACAO'
$cs = Get-CimInstance Win32_ComputerSystem; $os = Get-CimInstance Win32_OperatingSystem
"Hostname: $env:COMPUTERNAME   Usuario SSH: $env:USERNAME   Logado no console: $($cs.UserName)"
"SO: $($os.Caption) $($os.Version)   Fabricante/Modelo: $($cs.Manufacturer) $($cs.Model)"
"Ligado desde: $($os.LastBootUpTime)   RAM: $([math]::Round($cs.TotalPhysicalMemory/1GB,1)) GB"
"Descricao do PC: $($os.Description)"
"Perfis em C:\Users: $((Get-ChildItem C:\Users -Directory | Select-Object -Expand Name) -join ', ')"
Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { "Disco $($_.DeviceID) livre $([math]::Round($_.FreeSpace/1GB,1)) / $([math]::Round($_.Size/1GB,1)) GB" }

H 'REDE'
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^127\.|^169\.254' } | ForEach-Object { "IP $($_.IPAddress)/$($_.PrefixLength)  ($($_.InterfaceAlias))" }
Get-NetRoute -DestinationPrefix '0.0.0.0/0' | ForEach-Object { "Gateway $($_.NextHop) via $($_.InterfaceAlias)" }
(netsh wlan show interfaces) -match '^\s*(SSID|State|Estado|Signal|Sinal)\s' | ForEach-Object { $_.Trim() }
"Perfis Wi-Fi salvos: $(((netsh wlan show profiles) -match ':\s' | ForEach-Object { ($_ -split ':',2)[1].Trim() }) -join ' | ')"

H 'PROGRAMAS INSTALADOS'
$regs = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
$apps = Get-ItemProperty $regs | Where-Object { $_.DisplayName -and -not $_.SystemComponent } |
  Select-Object DisplayName, DisplayVersion, Publisher, InstallLocation, InstallDate | Sort-Object DisplayName -Unique
$apps | ForEach-Object { "{0} | {1} | {2} | {3}" -f $_.DisplayName, $_.DisplayVersion, $_.Publisher, $_.InstallDate }
"--- Apps da Microsoft Store (nao-Microsoft):"
Get-AppxPackage | Where-Object { $_.Publisher -notmatch 'Microsoft' -and -not $_.IsFramework } | ForEach-Object { "$($_.Name) $($_.Version)" }
"--- Relevantes para restaurante/PDV:"
$apps | Where-Object { $_.DisplayName -match "(?i)$POS" } | ForEach-Object { "  * $($_.DisplayName) $($_.DisplayVersion)  [$($_.InstallLocation)]" }

H 'PROCESSOS EM EXECUCAO (fora do Windows)'
Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath -notmatch '(?i)\\Windows\\' } |
  Group-Object ExecutablePath | ForEach-Object { "{0,-28} x{1}  sessao {2}  {3}" -f $_.Group[0].Name, $_.Count, $_.Group[0].SessionId, $_.Name }
"--- Janelas abertas:"
Get-Process | Where-Object { $_.MainWindowTitle } | ForEach-Object { "  $($_.ProcessName): $($_.MainWindowTitle)" }

H 'INICIALIZACAO AUTOMATICA'
Get-CimInstance Win32_StartupCommand | ForEach-Object { "$($_.Name) | $($_.Command) | $($_.User)" }
"--- Servicos de terceiros em execucao:"
Get-CimInstance Win32_Service | Where-Object { $_.State -eq 'Running' -and $_.PathName -notmatch '(?i)\\Windows\\|svchost' } | ForEach-Object { "$($_.Name) | $($_.DisplayName) | $($_.StartMode)" }

H 'ARQUIVOS (Area de Trabalho, Documentos, Downloads de cada perfil)'
foreach ($p in Get-ChildItem C:\Users -Directory) {
  foreach ($sub in 'Desktop','OneDrive\Desktop','OneDrive\Area de Trabalho','Documents','Downloads') {
    $d = Join-Path $p.FullName $sub
    if (Test-Path $d) {
      $items = Get-ChildItem $d -Force | Where-Object { $_.Name -notmatch '^desktop\.ini$' } | Sort-Object LastWriteTime -Descending | Select-Object -First 40
      if ($items) { "--- $d ($((Get-ChildItem $d -Force).Count) itens; 40 mais recentes)"; $items | ForEach-Object { "  {0:yyyy-MM-dd}  {1}{2}" -f $_.LastWriteTime, $_.Name, $(if ($_.PSIsContainer) { '\' } else { '' }) } }
    }
  }
}
"--- Area de Trabalho publica:"; Get-ChildItem 'C:\Users\Public\Desktop' -Force | ForEach-Object { "  $($_.Name)" }
"--- Atalhos (.lnk) e destinos:"
$sh = New-Object -ComObject WScript.Shell
Get-ChildItem 'C:\Users\*\Desktop\*.lnk','C:\Users\Public\Desktop\*.lnk','C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup\*.lnk','C:\Users\*\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\*.lnk' -Force |
  ForEach-Object { $l = $sh.CreateShortcut($_.FullName); "  $($_.Name) -> $($l.TargetPath) $($l.Arguments)" }
"--- Pastas na raiz de C:"; Get-ChildItem C:\ -Directory -Force | Where-Object { $_.Name -notmatch '^\$|^(Windows|ProgramData|Recovery|System Volume Information|PerfLogs|Documents and Settings|Config.Msi)$' } | ForEach-Object { "  $($_.Name)" }

H 'IFOOD'
"--- Programas:"; $apps | Where-Object { $_.DisplayName -match '(?i)ifood|gestor de pedidos' } | ForEach-Object { "  $($_.DisplayName) $($_.DisplayVersion) [$($_.InstallLocation)]" }
"--- Apps Store:"; Get-AppxPackage | Where-Object { $_.Name -match '(?i)ifood' } | ForEach-Object { "  $($_.Name) $($_.Version)" }
"--- Processos:"; Get-CimInstance Win32_Process | Where-Object { "$($_.Name) $($_.ExecutablePath) $($_.CommandLine)" -match '(?i)ifood|gestordepedidos' } | ForEach-Object { "  RODANDO: $($_.Name) [$($_.ExecutablePath)] sessao $($_.SessionId)" }
$ifoodDirs = Get-ChildItem 'C:\Users\*\AppData\Local','C:\Users\*\AppData\Roaming','C:\Users\*\AppData\Local\Programs','C:\Program Files','C:\Program Files (x86)','C:\ProgramData' -Directory -Force | Where-Object { $_.Name -match '(?i)ifood|gestor' }
"--- Pastas:"; $ifoodDirs | ForEach-Object { "  $($_.FullName)  (modif. $($_.LastWriteTime))" }
"--- Atalhos/abas do navegador apontando para iFood:"
Get-ChildItem 'C:\Users\*\Desktop\*','C:\Users\Public\Desktop\*' -Include *.lnk,*.url -Force | ForEach-Object {
  $t = if ($_.Extension -eq '.lnk') { $l = $sh.CreateShortcut($_.FullName); "$($l.TargetPath) $($l.Arguments)" } else { Get-Content $_.FullName -Raw }
  if ("$($_.Name) $t" -match '(?i)ifood') { "  $($_.FullName) -> $t" } }

H 'VINCULO COM LOJA (Barbacue / Barbadog / Chelas)'
$score = @{ barbacue = 0; barbadog = 0; chelas = 0 }
function Tally($text, $origem) {
  if (-not $text) { return }
  $clean = [regex]::Replace($text, '(?i)barbacue\.cog\.ia\.br', '')   # ignora o dominio do suporte
  foreach ($k in 'barbacue','barbadog','chelas') {
    $re = @{ barbacue = 'barba\s?cue'; barbadog = 'barba\s?dog'; chelas = 'chelas' }[$k]
    $n = [regex]::Matches($clean, "(?i)$re").Count
    if ($n) { $script:score[$k] += $n }
  }
  $sn = Snips $clean $KW 8
  if ($sn) { "  [$origem]"; $sn | ForEach-Object { "     $_" } }
}
Tally "$env:COMPUTERNAME $env:USERNAME $($cs.UserName) $($os.Description) $((Get-ChildItem C:\Users -Directory).Name -join ' ')" 'nome do PC / usuarios'
Tally ((netsh wlan show profiles) -join ' ') 'perfis Wi-Fi'
Tally ((Get-Printer | ForEach-Object { "$($_.Name) $($_.ShareName) $($_.Comment) $($_.Location)" }) -join ' ') 'impressoras'
Tally ((Get-ChildItem 'C:\Users\*\Desktop','C:\Users\*\Documents','C:\Users\*\Downloads' -Recurse -Depth 2 -Force | Select-Object -First 3000 -Expand Name) -join ' ') 'nomes de arquivos'
foreach ($d in $ifoodDirs) {
  $files = Get-ChildItem $d.FullName -Recurse -File -Force -Include *.log,*.json,*.ldb,*.txt,*.config,*.xml,*.ini,*.db,*.sqlite | Where-Object { $_.Length -lt 20MB } | Sort-Object LastWriteTime -Descending | Select-Object -First 300
  foreach ($f in $files) {
    $raw = try { [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::GetEncoding(28591)) } catch { try { $tmp = "$env:TEMP\inv_$([guid]::NewGuid()).bin"; Copy-Item $f.FullName $tmp; [IO.File]::ReadAllText($tmp, [Text.Encoding]::GetEncoding(28591)); Remove-Item $tmp } catch { '' } }
    Tally $raw "iFood: $($f.FullName)"
    foreach ($m in [regex]::Matches($raw, '(?i)"(merchantName|merchant_name|restaurantName|storeName|tradingName|corporateName|fantasyName|nomeFantasia|merchantId)"\s*:\s*"[^"]{2,80}"') | Select-Object -First 10) { "     CAMPO: $($m.Value)" }
  }
}
"--- Navegadores (historico/favoritos):"
$prof = Get-ChildItem 'C:\Users\*\AppData\Local\Google\Chrome\User Data\*','C:\Users\*\AppData\Local\Microsoft\Edge\User Data\*','C:\Users\*\AppData\Local\BraveSoftware\Brave-Browser\User Data\*' -Directory -Force | Where-Object { Test-Path (Join-Path $_.FullName 'History') }
foreach ($p in $prof) {
  foreach ($fn in 'History','Bookmarks','Preferences') {
    $src = Join-Path $p.FullName $fn; if (-not (Test-Path $src)) { continue }
    $tmp = "$env:TEMP\inv_$([guid]::NewGuid()).bin"; Copy-Item $src $tmp -Force
    $raw = try { [IO.File]::ReadAllText($tmp, [Text.Encoding]::UTF8) } catch { '' }; Remove-Item $tmp -Force
    Tally $raw "$fn $($p.FullName)"
    if ($fn -eq 'History') {
      $urls = [regex]::Matches($raw, '(?i)https?://[a-z0-9.-]*ifood\.com\.br[^\x00-\x1F\s"]{0,80}') | ForEach-Object { $_.Value -replace '\?.*$','' } | Sort-Object -Unique | Select-Object -First 15
      if ($urls) { "  URLs iFood em $($p.FullName):"; $urls | ForEach-Object { "     $_" } }
    }
  }
}
"--- PONTUACAO: barbacue=$($score.barbacue)  barbadog=$($score.barbadog)  chelas=$($score.chelas)"

H 'IMPRESSORAS'
"Spooler: $((Get-Service Spooler).Status)"
$def = (Get-CimInstance Win32_Printer | Where-Object Default).Name
"Padrao: $def"
$ports = @{}; Get-PrinterPort | ForEach-Object { $ports[$_.Name] = $_ }
foreach ($pr in Get-Printer) {
  $w = Get-CimInstance Win32_Printer -Filter "Name='$($pr.Name -replace "'","''")'"
  $pt = $ports[$pr.PortName]
  "--- $($pr.Name)"
  "    Driver: $($pr.DriverName) | Porta: $($pr.PortName) | Status: $($pr.PrinterStatus) | Offline: $($w.WorkOffline) | Erro detectado: $($w.DetectedErrorState) | Compartilhada: $($pr.Shared) $($pr.ShareName)"
  $jobs = Get-PrintJob -PrinterName $pr.Name
  if ($jobs) { "    Fila: $($jobs.Count) trabalho(s) -> $(($jobs | ForEach-Object { "$($_.DocumentName) [$($_.JobStatus)] $($_.SubmittedTime)" }) -join '; ')" } else { "    Fila: vazia" }
  $hostAddr = $pt.PrinterHostAddress
  if (-not $hostAddr -and $pr.PortName -match '^(IP_)?(\d{1,3}(\.\d{1,3}){3})') { $hostAddr = $Matches[2] }
  if ($hostAddr) {
    $port = if ($pt.PortNumber) { $pt.PortNumber } else { 9100 }
    $tcp = New-Object Net.Sockets.TcpClient; $ok = $tcp.ConnectAsync($hostAddr, $port).Wait(2500); $tcp.Close()
    $ping = Test-Connection $hostAddr -Count 1 -Quiet
    "    REDE: $hostAddr porta $port -> TCP $(if ($ok) {'OK'} else {'FALHOU'}) | ping $(if ($ping) {'OK'} else {'FALHOU'})"
  } elseif ($pr.PortName -match '^USB|^DOT4|^LPT|^COM') {
    "    LOCAL ($($pr.PortName)) - ver dispositivos USB abaixo"
  } elseif ($pr.PortName -match '^\\\\') { "    COMPARTILHADA EM: $($pr.PortName)" }
}
"--- Dispositivos de impressao detectados (PnP):"
Get-PnpDevice | Where-Object { $_.Class -match 'Printer|PrintQueue' -or $_.FriendlyName -match '(?i)print|epson|elgin|bematech|daruma|tm-t|i9|i7|mp-4200|termica|thermal|pos-?80|pos-?58|tanca|sweda|knup|jetway|argox|zebra' } |
  Where-Object { $_.Class -ne 'PrintQueue' -or $_.FriendlyName -notmatch '(?i)fax|pdf|xps|onenote' } |
  ForEach-Object { "  [$($_.Status)] $($_.Class) | $($_.FriendlyName) | $($_.InstanceId)" }
"--- Portas seriais:"; Get-CimInstance Win32_SerialPort | ForEach-Object { "  $($_.DeviceID) $($_.Description) $($_.Status)" }
"--- Erros recentes do servico de impressao:"
Get-WinEvent -LogName 'Microsoft-Windows-PrintService/Admin' -MaxEvents 15 | ForEach-Object { "  $($_.TimeCreated) [$($_.Id)] $(($_.Message -split "`n")[0])" }
"`n==================== FIM ===================="
