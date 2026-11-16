// Proxy4Auto: os scripts do PowerShell do nó Permissão de administrador. Vão codificados na linha de comando
// (sem .ps1 nem .bat) e cada um grava o resultado em JSON no arquivo de saída.
export const psTexto = (s) => "'" + String(s).replace(/'/g, "''") + "'";
// os scripts das ações de administrador; cada um grava o resultado em JSON no arquivo de saída
export const SCRIPTS = {
  nada: (saida) => `@{ ok = $true } | ConvertTo-Json -Compress | Set-Content -Encoding utf8 ${psTexto(saida)}`,
  // o mesmo que o dns-adaptador.ps1 do proxy: adaptadores físicos ligados passam a usar 127.0.0.1, guardando o anterior
  dns_proxy: (saida, backup) => `$ErrorActionPreference = 'Stop'
$ads = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and -not $_.Virtual }
$salvo = @{}; $feitos = @()
foreach ($a in $ads) {
  $dns = (Get-DnsClientServerAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4).ServerAddresses
  $salvo[$a.Name] = @($dns)
  Set-DnsClientServerAddress -InterfaceIndex $a.ifIndex -ServerAddresses '127.0.0.1'
  $feitos += @{ adaptador = $a.Name; antes = (@($dns) -join ', ') }
}
if (-not (Test-Path ${psTexto(backup)})) { $salvo | ConvertTo-Json | Set-Content -Encoding utf8 ${psTexto(backup)} }
ipconfig /flushdns | Out-Null
@{ ok = $true; adaptadores = $feitos } | ConvertTo-Json -Compress -Depth 4 | Set-Content -Encoding utf8 ${psTexto(saida)}`,
  dns_restaurar: (saida, backup) => `$ErrorActionPreference = 'Stop'
$salvo = @{}
if (Test-Path ${psTexto(backup)}) { (Get-Content ${psTexto(backup)} -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $salvo[$_.Name] = @($_.Value) } }
$feitos = @()
foreach ($a in (Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and -not $_.Virtual })) {
  $ant = @($salvo[$a.Name] | Where-Object { $_ -and $_ -ne '127.0.0.1' })
  if ($ant.Count -gt 0) { Set-DnsClientServerAddress -InterfaceIndex $a.ifIndex -ServerAddresses $ant; $feitos += @{ adaptador = $a.Name; agora = ($ant -join ', ') } }
  else { Set-DnsClientServerAddress -InterfaceIndex $a.ifIndex -ResetServerAddresses; $feitos += @{ adaptador = $a.Name; agora = 'automático (DHCP)' } }
}
ipconfig /flushdns | Out-Null
if (Test-Path ${psTexto(backup)}) { Remove-Item ${psTexto(backup)} }
@{ ok = $true; adaptadores = $feitos } | ConvertTo-Json -Compress -Depth 4 | Set-Content -Encoding utf8 ${psTexto(saida)}`,
  programa: (saida, _b, programa, args, pasta) => `$ErrorActionPreference = 'Stop'
$p = Start-Process -FilePath ${psTexto(programa)}${args.length ? ' -ArgumentList ' + args.map((a) => psTexto(/[\s"]/.test(a) ? '"' + a.replace(/"/g, '\\"') + '"' : a)).join(',') : ''}${pasta ? ' -WorkingDirectory ' + psTexto(pasta) : ''} -Wait -PassThru -WindowStyle Hidden
@{ ok = ($p.ExitCode -eq 0); codigo = $p.ExitCode } | ConvertTo-Json -Compress | Set-Content -Encoding utf8 ${psTexto(saida)}`,
};
