[CmdletBinding()]
param(
  [switch]$WithoutFix
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$containerName = 'starqerp-serp182-idempotency-probe'
$image = 'public.ecr.aws/supabase/postgres:17.6.1.155'
$password = 'synthetic-serp182-only'
$port = 54333
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
    if ($WithoutFix -and $migration.Name -eq '202608250014_idempotency_replay.sql') {
      continue
    }
    Invoke-DockerChecked exec $containerName psql `
      --username postgres --dbname postgres --set ON_ERROR_STOP=1 `
      --file "/workspace/supabase/migrations/$($migration.Name)" | Out-Host
  }

  Invoke-DockerChecked exec $containerName psql `
    --username postgres --dbname postgres --set ON_ERROR_STOP=1 `
    --file '/workspace/tests/rls_isolation_fixture.sql' | Out-Host

  & python (Join-Path $repoRoot 'tests/test_idempotency_replay.py') --port $port
  if ($LASTEXITCODE -ne 0) {
    throw "SERP-182 behavioral probe failed with exit code $LASTEXITCODE"
  }

  Write-Host 'SERP-182 idempotency replay probe: PASS' -ForegroundColor Green
} finally {
  if ($started) {
    & docker stop $containerName *> $null
    & docker rm $containerName *> $null
  }
}
