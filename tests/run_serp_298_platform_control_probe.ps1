[CmdletBinding()]
param([string]$PostgresBin='C:\Program Files\PostgreSQL\17\bin',[int]$Port=55434,[string]$Database='serp298')
$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
if($Database -ne 'serp298'){throw 'Harness may only recreate the fixed synthetic database serp298.'}
$repoRoot=Split-Path -Parent $PSScriptRoot; $runtimeRoot='D:\StarqTech\_tmp'; $dataDirectory=Join-Path $runtimeRoot 'serp298-pgdata'; $serverLog=Join-Path $runtimeRoot 'serp298-postgres.log'
$psql=Join-Path $PostgresBin 'psql.exe'; $ready=Join-Path $PostgresBin 'pg_isready.exe'; $ctl=Join-Path $PostgresBin 'pg_ctl.exe'; $init=Join-Path $PostgresBin 'initdb.exe'; $drop=Join-Path $PostgresBin 'dropdb.exe'; $create=Join-Path $PostgresBin 'createdb.exe'; $started=$false
function Invoke-Checked{param([string]$FilePath,[Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments); & $FilePath @Arguments; if($LASTEXITCODE -ne 0){throw "$FilePath failed: $LASTEXITCODE"}}
try{
  New-Item -ItemType Directory -Force -Path $runtimeRoot|Out-Null
  if(-not(Test-Path -LiteralPath (Join-Path $dataDirectory 'PG_VERSION'))){if(Test-Path -LiteralPath $dataDirectory){throw "Incomplete synthetic cluster: $dataDirectory"}; Invoke-Checked $init @('-D',$dataDirectory,'-U','postgres','-A','trust','--no-locale','--encoding=UTF8')}
  & $ready -h localhost -p $Port *> $null; if($LASTEXITCODE -ne 0){Invoke-Checked $ctl @('-D',$dataDirectory,'-l',$serverLog,'-o',"-p $Port",'start'); $started=$true}
  Invoke-Checked $drop @('-h','localhost','-p',"$Port",'-U','postgres','--if-exists',$Database); Invoke-Checked $create @('-h','localhost','-p',"$Port",'-U','postgres',$Database)
  Invoke-Checked $psql @('-h','localhost','-p',"$Port",'-U','postgres','-d',$Database,'-v','ON_ERROR_STOP=1','-f',(Join-Path $PSScriptRoot 'serp_298_postgres_bootstrap.sql'))
  Get-ChildItem (Join-Path $repoRoot 'supabase\migrations') -Filter '*.sql' -File|Sort-Object Name|ForEach-Object{Write-Host "=== APPLY $($_.Name) ==="; Invoke-Checked $psql @('-h','localhost','-p',"$Port",'-U','postgres','-d',$Database,'-v','ON_ERROR_STOP=1','-f',$_.FullName)}
  Invoke-Checked $psql @('-h','localhost','-p',"$Port",'-U','postgres','-d',$Database,'-v','ON_ERROR_STOP=1','-f',(Join-Path $PSScriptRoot 'serp_298_platform_control_probe.sql'))
  Write-Host 'SERP-298 executable PostgreSQL gate: PASS'
}finally{if($started){& $ctl -D $dataDirectory stop *> $null}}
