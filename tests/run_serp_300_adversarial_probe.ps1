[CmdletBinding()]
param(
  [string]$PostgresBin = 'C:\Program Files\PostgreSQL\17\bin',
  [int]$Port = 55432,
  [string]$Database = 'serp300'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($Database -ne 'serp300') {
  throw 'The harness may only recreate the dedicated synthetic database named serp300.'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = 'D:\StarqTech\_tmp'
$dataDirectory = Join-Path $runtimeRoot 'serp300-pgdata'
$serverLog = Join-Path $runtimeRoot 'serp300-postgres.log'
$psql = Join-Path $PostgresBin 'psql.exe'
$pgIsReady = Join-Path $PostgresBin 'pg_isready.exe'
$pgCtl = Join-Path $PostgresBin 'pg_ctl.exe'
$initDb = Join-Path $PostgresBin 'initdb.exe'
$dropDb = Join-Path $PostgresBin 'dropdb.exe'
$createDb = Join-Path $PostgresBin 'createdb.exe'
$startedHere = $false

foreach ($binary in @($psql, $pgIsReady, $pgCtl, $initDb, $dropDb, $createDb)) {
  if (-not (Test-Path -LiteralPath $binary)) {
    throw "Required PostgreSQL binary not found: $binary"
  }
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory)][string]$FilePath,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath failed with exit code $LASTEXITCODE"
  }
}

try {
  New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
  if (-not (Test-Path -LiteralPath (Join-Path $dataDirectory 'PG_VERSION'))) {
    if (Test-Path -LiteralPath $dataDirectory) {
      throw "Incomplete test cluster exists and will not be overwritten: $dataDirectory"
    }
    Invoke-Checked -FilePath $initDb -Arguments @('-D', $dataDirectory, '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8')
  }

  & $pgIsReady -h localhost -p $Port *> $null
  if ($LASTEXITCODE -ne 0) {
    Invoke-Checked -FilePath $pgCtl -Arguments @('-D', $dataDirectory, '-l', $serverLog, '-o', "-p $Port", 'start')
    $startedHere = $true
  }

  # The only destructive operation is confined to the fixed synthetic database.
  Invoke-Checked -FilePath $dropDb -Arguments @('-h', 'localhost', '-p', "$Port", '-U', 'postgres', '--if-exists', $Database)
  Invoke-Checked -FilePath $createDb -Arguments @('-h', 'localhost', '-p', "$Port", '-U', 'postgres', $Database)

  Invoke-Checked -FilePath $psql -Arguments @(
    '-h', 'localhost', '-p', "$Port", '-U', 'postgres', '-d', $Database,
    '-v', 'ON_ERROR_STOP=1', '-f', (Join-Path $PSScriptRoot 'serp_300_postgres_bootstrap.sql')
  )

  $migrationFiles = Get-ChildItem (Join-Path $repoRoot 'supabase\migrations') -Filter '*.sql' -File |
    Sort-Object Name
  foreach ($migration in $migrationFiles) {
    Write-Host "=== APPLY $($migration.Name) ==="
    Invoke-Checked -FilePath $psql -Arguments @(
      '-h', 'localhost', '-p', "$Port", '-U', 'postgres', '-d', $Database,
      '-v', 'ON_ERROR_STOP=1', '-f', $migration.FullName
    )
  }

  Invoke-Checked -FilePath $psql -Arguments @(
    '-h', 'localhost', '-p', "$Port", '-U', 'postgres', '-d', $Database,
    '-v', 'ON_ERROR_STOP=1', '-f', (Join-Path $PSScriptRoot 'serp_300_adversarial_isolation_probe.sql')
  )

  Write-Host 'SERP-300 adversarial PostgreSQL probe: PASS'
} finally {
  if ($startedHere) {
    & $pgCtl -D $dataDirectory stop *> $null
  }
}
