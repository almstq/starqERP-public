[CmdletBinding()]
param(
  [switch]$SimulatePolicyDrift,
  [switch]$SimulatePermissivePolicy
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$containerName = 'starqerp-serp124-rls-probe'
$image = 'public.ecr.aws/supabase/postgres:17.6.1.155'
$password = 'synthetic-serp124-only'
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
  if ($LASTEXITCODE -ne 0) {
    Invoke-DockerChecked create `
      --name $containerName `
      --mount "type=bind,source=$repoRoot,target=/workspace,readonly" `
      --tmpfs '/var/lib/postgresql/data:rw,noexec,nosuid,size=1g' `
      --env "POSTGRES_PASSWORD=$password" `
      --env 'POSTGRES_DB=postgres' `
      $image | Out-Null
  } else {
    $running = (& docker inspect --format '{{.State.Running}}' $containerName).Trim()
    if ($running -eq 'true') {
      Invoke-DockerChecked stop $containerName | Out-Null
    }
  }

  Invoke-DockerChecked start $containerName | Out-Null
  $started = $true

  # Supabase's image briefly accepts connections during first-time initialization, then
  # restarts PostgreSQL. Waiting only for pg_isready races that restart and produces a false
  # harness failure, so require the container healthcheck to reach its final healthy state.
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

  if ($SimulatePolicyDrift) {
    Invoke-DockerChecked exec $containerName psql `
      --username postgres --dbname postgres --set ON_ERROR_STOP=1 `
      --command 'alter policy organisations_current on public.organisations rename to organisations_drifted' |
      Out-Host
  }

  if ($SimulatePermissivePolicy) {
    Invoke-DockerChecked exec $containerName psql `
      --username postgres --dbname postgres --set ON_ERROR_STOP=1 `
      --command 'alter policy vehicles_current on public.vehicles using (true)' |
      Out-Host
  }

  Invoke-DockerChecked exec $containerName psql `
    --username postgres --dbname postgres --set ON_ERROR_STOP=1 `
    --file '/workspace/tests/rls_isolation_probe.sql' | Out-Host

  Write-Host 'SERP-124 RLS isolation probe: PASS'
} finally {
  if ($started) {
    & docker stop $containerName *> $null
  }
}
