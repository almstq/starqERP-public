[CmdletBinding()]
param(
  [string]$PostgresBin = 'C:\Program Files\PostgreSQL\17\bin',
  [int]$Port = 55433
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$sourceDatabase = 'serp037_source'
$scratchDatabase = 'serp037_scratch'
$repoRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = 'D:\StarqTech\_tmp\serp037'
$dataDirectory = Join-Path $runtimeRoot 'pgdata'
$serverLog = Join-Path $runtimeRoot 'postgres.log'
$plainDump = Join-Path $runtimeRoot 'serp037-source.dump'
$encryptedDump = Join-Path $runtimeRoot 'serp037-source.dump.aesgcm'
$decryptedDump = Join-Path $runtimeRoot 'serp037-decrypted.dump'
$psql = Join-Path $PostgresBin 'psql.exe'
$pgIsReady = Join-Path $PostgresBin 'pg_isready.exe'
$pgCtl = Join-Path $PostgresBin 'pg_ctl.exe'
$initDb = Join-Path $PostgresBin 'initdb.exe'
$dropDb = Join-Path $PostgresBin 'dropdb.exe'
$createDb = Join-Path $PostgresBin 'createdb.exe'
$pgDump = Join-Path $PostgresBin 'pg_dump.exe'
$pgRestore = Join-Path $PostgresBin 'pg_restore.exe'
$startedHere = $false
$key = $null

foreach ($binary in @($psql, $pgIsReady, $pgCtl, $initDb, $dropDb, $createDb, $pgDump, $pgRestore)) {
  if (-not (Test-Path -LiteralPath $binary)) {
    throw "Required PostgreSQL binary not found: $binary"
  }
}

$resolvedRuntime = [IO.Path]::GetFullPath($runtimeRoot)
if ($resolvedRuntime -ne 'D:\StarqTech\_tmp\serp037') {
  throw "Unexpected runtime root: $resolvedRuntime"
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

function Get-Manifest {
  param([Parameter(Mandatory)][string]$Database)

  $sql = @"
select jsonb_build_object(
  'public_base_tables', (select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'),
  'platform_base_tables', (select count(*) from information_schema.tables where table_schema = 'platform' and table_type = 'BASE TABLE'),
  'organisations', (select count(*) from public.organisations),
  'persons', (select count(*) from public.persons),
  'memberships', (select count(*) from public.memberships),
  'audit_events', (select count(*) from public.audit_events),
  'fixture_digest', (
    select encode(extensions.digest(string_agg(id::text || ':' || slug, '|' order by id), 'sha256'), 'hex')
    from public.organisations
  )
)::text;
"@

  $result = & $psql -h localhost -p $Port -U postgres -d $Database -At -v ON_ERROR_STOP=1 -c $sql
  if ($LASTEXITCODE -ne 0 -or @($result).Count -ne 1) {
    throw "Manifest query failed for $Database"
  }
  return [string]$result
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

  foreach ($database in @($sourceDatabase, $scratchDatabase)) {
    Invoke-Checked -FilePath $dropDb -Arguments @('-h', 'localhost', '-p', "$Port", '-U', 'postgres', '--if-exists', $database)
  }
  Invoke-Checked -FilePath $createDb -Arguments @('-h', 'localhost', '-p', "$Port", '-U', 'postgres', $sourceDatabase)

  Invoke-Checked -FilePath $psql -Arguments @(
    '-h', 'localhost', '-p', "$Port", '-U', 'postgres', '-d', $sourceDatabase,
    '-v', 'ON_ERROR_STOP=1', '-f', (Join-Path $PSScriptRoot 'serp_037_postgres_bootstrap.sql')
  )

  $migrationFiles = Get-ChildItem (Join-Path $repoRoot 'supabase\migrations') -Filter '*.sql' -File | Sort-Object Name
  foreach ($migration in $migrationFiles) {
    Write-Host "=== APPLY $($migration.Name) ==="
    Invoke-Checked -FilePath $psql -Arguments @(
      '-h', 'localhost', '-p', "$Port", '-U', 'postgres', '-d', $sourceDatabase,
      '-v', 'ON_ERROR_STOP=1', '-f', $migration.FullName
    )
  }

  Invoke-Checked -FilePath $psql -Arguments @(
    '-h', 'localhost', '-p', "$Port", '-U', 'postgres', '-d', $sourceDatabase,
    '-v', 'ON_ERROR_STOP=1', '-f', (Join-Path $PSScriptRoot 'serp_037_restore_fixture.sql')
  )

  $sourceManifest = Get-Manifest -Database $sourceDatabase
  Write-Host "SOURCE MANIFEST: $sourceManifest"

  foreach ($file in @($plainDump, $encryptedDump, $decryptedDump)) {
    if (Test-Path -LiteralPath $file) {
      Remove-Item -LiteralPath $file -Force
    }
  }

  Invoke-Checked -FilePath $pgDump -Arguments @(
    '-h', 'localhost', '-p', "$Port", '-U', 'postgres', '-d', $sourceDatabase,
    '--format=custom', '--no-owner', '--no-privileges', '--file', $plainDump
  )

  $plainBytes = [IO.File]::ReadAllBytes($plainDump)
  $plainHash = (Get-FileHash -LiteralPath $plainDump -Algorithm SHA256).Hash.ToLowerInvariant()
  $key = [byte[]]::new(32)
  $nonce = [byte[]]::new(12)
  $tag = [byte[]]::new(16)
  $cipherBytes = [byte[]]::new($plainBytes.Length)
  [Security.Cryptography.RandomNumberGenerator]::Fill($key)
  [Security.Cryptography.RandomNumberGenerator]::Fill($nonce)
  $aes = [Security.Cryptography.AesGcm]::new($key, 16)
  try {
    $aes.Encrypt($nonce, $plainBytes, $cipherBytes, $tag)
  } finally {
    $aes.Dispose()
  }

  $encryptedBytes = [byte[]]::new($nonce.Length + $tag.Length + $cipherBytes.Length)
  [Buffer]::BlockCopy($nonce, 0, $encryptedBytes, 0, $nonce.Length)
  [Buffer]::BlockCopy($tag, 0, $encryptedBytes, $nonce.Length, $tag.Length)
  [Buffer]::BlockCopy($cipherBytes, 0, $encryptedBytes, $nonce.Length + $tag.Length, $cipherBytes.Length)
  [IO.File]::WriteAllBytes($encryptedDump, $encryptedBytes)
  $cipherHash = (Get-FileHash -LiteralPath $encryptedDump -Algorithm SHA256).Hash.ToLowerInvariant()

  Remove-Item -LiteralPath $plainDump -Force
  & $pgRestore --list $encryptedDump *> $null
  if ($LASTEXITCODE -eq 0) {
    throw 'Encrypted artifact was unexpectedly readable as a PostgreSQL archive'
  }
  Write-Host 'NEGATIVE: encrypted artifact rejected by pg_restore as expected'

  $stored = [IO.File]::ReadAllBytes($encryptedDump)
  $storedNonce = $stored[0..11]
  $storedTag = $stored[12..27]
  $storedCipher = $stored[28..($stored.Length - 1)]
  $restoredPlain = [byte[]]::new($storedCipher.Length)
  $aes = [Security.Cryptography.AesGcm]::new($key, 16)
  try {
    $aes.Decrypt($storedNonce, $storedCipher, $storedTag, $restoredPlain)
  } finally {
    $aes.Dispose()
  }
  [IO.File]::WriteAllBytes($decryptedDump, $restoredPlain)
  $decryptedHash = (Get-FileHash -LiteralPath $decryptedDump -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($decryptedHash -ne $plainHash) {
    throw 'Decrypted archive digest does not match the source archive'
  }

  Invoke-Checked -FilePath $createDb -Arguments @('-h', 'localhost', '-p', "$Port", '-U', 'postgres', $scratchDatabase)
  Invoke-Checked -FilePath $pgRestore -Arguments @(
    '-h', 'localhost', '-p', "$Port", '-U', 'postgres', '-d', $scratchDatabase,
    '--no-owner', '--no-privileges', '--exit-on-error', $decryptedDump
  )

  $scratchManifest = Get-Manifest -Database $scratchDatabase
  Write-Host "SCRATCH MANIFEST: $scratchManifest"
  if ($sourceManifest -ne $scratchManifest) {
    throw 'Scratch restore manifest does not reconcile with the source manifest'
  }

  Invoke-Checked -FilePath $psql -Arguments @(
    '-h', 'localhost', '-p', "$Port", '-U', 'postgres', '-d', $sourceDatabase,
    '-v', 'ON_ERROR_STOP=1',
    '-v', "plaintext_sha=$plainHash",
    '-v', "ciphertext_sha=$cipherHash",
    '-v', "plaintext_bytes=$($plainBytes.Length)",
    '-v', "ciphertext_bytes=$($encryptedBytes.Length)",
    '-v', "source_manifest=$sourceManifest",
    '-v', "scratch_manifest=$scratchManifest",
    '-f', (Join-Path $PSScriptRoot 'serp_037_record_actual_restore.sql')
  )

  Invoke-Checked -FilePath $psql -Arguments @(
    '-h', 'localhost', '-p', "$Port", '-U', 'postgres', '-d', $sourceDatabase,
    '-v', 'ON_ERROR_STOP=1', '-f', (Join-Path $PSScriptRoot 'serp_037_backup_contract_probe.sql')
  )

  Write-Host "PLAINTEXT SHA256: $plainHash"
  Write-Host "CIPHERTEXT SHA256: $cipherHash"
  Write-Host "ENCRYPTED ARTIFACT: $encryptedDump"
  Write-Host 'SERP-037 encrypted backup and scratch-restore probe: PASS'
} finally {
  foreach ($file in @($plainDump, $decryptedDump)) {
    if (Test-Path -LiteralPath $file) {
      Remove-Item -LiteralPath $file -Force
    }
  }
  if ($null -ne $key) {
    [Security.Cryptography.CryptographicOperations]::ZeroMemory($key)
  }
  if ($startedHere) {
    & $pgCtl -D $dataDirectory stop *> $null
  }
}
