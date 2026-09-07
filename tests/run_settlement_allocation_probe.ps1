[CmdletBinding()]
param(
  [switch]$SimulateBrokenCurrencyCheck,
  [switch]$SimulatePermissiveAllocation,
  [switch]$SimulateUnlockedConcurrency
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$containerName = 'starqerp-serp181-settlement-probe'
$image = 'public.ecr.aws/supabase/postgres:17.6.1.155'
$password = 'synthetic-serp181-only'
$port = 54332
$started = $false

function Invoke-DockerChecked {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & docker @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "docker $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

try {
  Invoke-DockerChecked info --format '{{.ServerVersion}}' | Out-Null
  Invoke-DockerChecked image inspect $image | Out-Null

  $existing = & docker container inspect $containerName 2>$null
  if ($LASTEXITCODE -eq 0) {
    & docker stop $containerName *> $null
    & docker rm $containerName *> $null
  }

  Invoke-DockerChecked create `
    --name $containerName `
    --publish "127.0.0.1:$port`:5432" `
    --mount "type=bind,source=$repoRoot,target=/workspace,readonly" `
    --tmpfs '/var/lib/postgresql/data:rw,noexec,nosuid,size=1g' `
    --env "POSTGRES_PASSWORD=$password" `
    --env 'POSTGRES_DB=postgres' `
    $image | Out-Null

  Invoke-DockerChecked start $containerName | Out-Null
  $started = $true

  $ready = $false
  foreach ($attempt in 1..90) {
    $state = (& docker inspect --format '{{.State.Status}} {{.State.Health.Status}}' $containerName).Trim()
    if ($state -eq 'running healthy') {
      $ready = $true
      break
    }
    if ($state.StartsWith('exited ')) {
      throw "Synthetic PostgreSQL runtime exited during initialization: $state"
    }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) {
    throw 'Synthetic PostgreSQL runtime did not become healthy within 90 seconds.'
  }

  $migrationFiles = Get-ChildItem (Join-Path $repoRoot 'supabase/migrations') -File -Filter '*.sql' |
    Sort-Object Name
  foreach ($migration in $migrationFiles) {
    $containerPath = "/workspace/supabase/migrations/$($migration.Name)"
    Invoke-DockerChecked exec $containerName psql `
      --username postgres --dbname postgres --set ON_ERROR_STOP=1 --file $containerPath | Out-Host
  }

  Invoke-DockerChecked exec $containerName psql `
    --username postgres --dbname postgres --set ON_ERROR_STOP=1 `
    --file '/workspace/tests/rls_isolation_fixture.sql' | Out-Host

  if ($SimulateBrokenCurrencyCheck) {
    # Red-first simulation: intentionally bypass the currency check in the assertion trigger
    Invoke-DockerChecked exec $containerName psql `
      --username postgres --dbname postgres --set ON_ERROR_STOP=1 `
      --command 'create or replace function app_private.assert_settlement_allocation_valid() returns trigger language plpgsql as $$ begin return new; end; $$;' |
      Out-Host
  }

  if ($SimulatePermissiveAllocation) {
    # Red-first simulation: drop append-only trigger
    Invoke-DockerChecked exec $containerName psql `
      --username postgres --dbname postgres --set ON_ERROR_STOP=1 `
      --command 'drop trigger settlement_allocations_append_only on public.settlement_allocations;' |
      Out-Host
  }

  Invoke-DockerChecked exec $containerName psql `
    --username postgres --dbname postgres --set ON_ERROR_STOP=1 `
    --file '/workspace/tests/settlement_allocation_probe.sql' | Out-Host

  if ($SimulateUnlockedConcurrency) {
    & python (Join-Path $repoRoot 'tests/test_settlement_concurrency.py') --port $port --simulate-unlocked
    if ($LASTEXITCODE -ne 0) {
      throw "Red-first simulation failed as expected: over-allocation reproduced without locking."
    }
  } else {
    & python (Join-Path $repoRoot 'tests/test_settlement_concurrency.py') --port $port
    if ($LASTEXITCODE -ne 0) {
      throw "Concurrency serialization test failed."
    }
  }

  Write-Host 'SERP-181 Settlement allocation & concurrency probe: PASS' -ForegroundColor Green
} finally {
  if ($started) {
    & docker stop $containerName *> $null
    & docker rm $containerName *> $null
  }
}
