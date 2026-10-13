Get-Process powershell | Where-Object { $_.Id -ne $PID -and $_.SessionId -eq 0 -and $_.StartTime -lt (Get-Date).AddMinutes(-2) } | Stop-Process -Force
$d = "$env:APPDATA\Gestor de Pedidos"
"##### $env:COMPUTERNAME"
"=== local-storage.json (chaves; tokens ocultos)"
$raw = Get-Content "$d\local-storage.json" -Raw
try { $j = $raw | ConvertFrom-Json; $j.PSObject.Properties | ForEach-Object { $v = "$($_.Value)"; if ($_.Name -match '(?i)token|secret|password|auth|key' -or $v.Length -gt 160) { $v = "<oculto, $($v.Length) chars>" }; "  $($_.Name) = $v" } } catch { "  (nao e JSON simples)" }
"=== nomes de loja / merchant"
$hits = @{}
$files = @(Get-Item "$d\local-storage.json", "$d\log.log") + (Get-ChildItem "$d\Local Storage\leveldb","$d\IndexedDB" -Recurse -File -Force) + (Get-ChildItem "$d\Session Storage" -File -Force | Sort-Object LastWriteTime -Descending | Select-Object -First 3)
$rxKey = [regex]::new('(?i)"?(merchantName|tradingName|corporateName|companyName|fantasyName|restaurantName|storeName|merchantId|merchant_id)"?\s*[:=]\s*"?[^",}\]\\]{2,80}')
$rxName = [regex]::new('(?i)barbacue|barbadog|barba dog|chelas|lanches do barba')
foreach ($f in $files) {
  $tmp = "$env:TEMP\g_$([guid]::NewGuid()).bin"; Copy-Item $f.FullName $tmp -Force
  $t = ([IO.File]::ReadAllText($tmp, [Text.Encoding]::GetEncoding(28591))).Replace([string][char]0, ''); Remove-Item $tmp -Force
  foreach ($m in $rxKey.Matches($t)) { $hits[$m.Value] = $f.Name }
  $n = 0
  foreach ($m in $rxName.Matches($t)) { if ($n++ -gt 300) { break }; $a = [Math]::Max(0, $m.Index - 40); $s = $t.Substring($a, [Math]::Min(100, $t.Length - $a)); $s = ($s -replace '[^\x20-\x7EÀ-ÿ]', ' ' -replace '\s+', ' ').Trim(); $hits[$s] = $f.Name }
}
$hits.Keys | Sort-Object | Select-Object -First 50 | ForEach-Object { "  $_   [$($hits[$_])]" }
"=== log.log: impressao (ultimas 15 linhas)"
Get-Content "$d\log.log" -Tail 4000 | Select-String -Pattern '(?i)print|impress' | Select-Object -Last 15 | ForEach-Object { "  " + $_.Line.Substring(0, [Math]::Min(220, $_.Line.Length)) }
