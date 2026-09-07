[CmdletBinding()]
param(
  # Negative controls. Each deliberately breaks one property of the boundary so
  # the probe can be shown to go RED for the right reason. DEC-072: a test that
  # has never been red is not proof of anything.
  [switch]$SimulateWideProjection,   # AC3 — widen the feed to expose a private column
  [switch]$SimulateLeakyPolicy,      # AC2 — admit unpublished rows to the read path
  [switch]$SimulateOwnerScopedView,  # AC2 — drop security_invoker so RLS is bypassed
  [switch]$SimulateSeatBypass,       # AC1 — let the counter seat publish
  [switch]$SimulateHardDelete        # AC4 — make revocation destroy the record
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$containerName = 'starqerp-serp125-publication-probe'
$image = 'public.ecr.aws/supabase/postgres:17.6.1.155'
$password = 'synthetic-serp125-only'
$started = $false

function Invoke-DockerChecked {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & docker @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "docker $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Invoke-Psql {
  param([string]$File, [string]$Command)
  if ($File) {
    Invoke-DockerChecked exec $containerName psql `
      --username postgres --dbname postgres --set ON_ERROR_STOP=1 --file $File | Out-Host
  } else {
    Invoke-DockerChecked exec $containerName psql `
      --username postgres --dbname postgres --set ON_ERROR_STOP=1 --command $Command | Out-Host
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

  # The Supabase image accepts connections briefly during first-time init and then
  # restarts PostgreSQL. Waiting on pg_isready races that restart, so require the
  # container healthcheck to reach its settled state.
  $ready = $false
  foreach ($attempt in 1..120) {
    $state = (& docker inspect --format '{{.State.Status}} {{.State.Health.Status}}' $containerName).Trim()
    if ($state -eq 'running healthy') { $ready = $true; break }
    if ($state.StartsWith('exited ')) {
      throw "Synthetic PostgreSQL runtime exited during initialization: $state"
    }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) {
    throw 'Synthetic PostgreSQL runtime did not become healthy within 120 seconds.'
  }

  $migrationFiles = Get-ChildItem (Join-Path $repoRoot 'supabase/migrations') -File -Filter '*.sql' |
    Sort-Object Name
  foreach ($migration in $migrationFiles) {
    Invoke-Psql -File "/workspace/supabase/migrations/$($migration.Name)"
  }

  Invoke-Psql -File '/workspace/tests/publication_boundary_fixture.sql'

  if ($SimulateWideProjection) {
    Write-Host 'NEGATIVE CONTROL: widening the feed to expose products.income_account' -ForegroundColor Yellow
    Invoke-Psql -Command @'
drop view public.publication_feed;
create view public.publication_feed with (security_invoker = true) as
select p.organisation_id, p.product_id, p.channel, p.public_name, p.public_description,
       p.public_price_amount, p.public_price_currency, p.published_at,
       pr.income_account
  from public.product_publications p
  join public.products pr on pr.organisation_id = p.organisation_id and pr.id = p.product_id
 where p.state = 'published';
'@
  }

  if ($SimulateLeakyPolicy) {
    Write-Host 'NEGATIVE CONTROL: admitting unpublished rows to the read path' -ForegroundColor Yellow
    Invoke-Psql -Command @'
drop view public.publication_feed;
create view public.publication_feed with (security_invoker = true) as
select p.organisation_id, p.product_id, p.channel, p.public_name, p.public_description,
       p.public_price_amount, p.public_price_currency, p.published_at
  from public.product_publications p;
'@
  }

  if ($SimulateOwnerScopedView) {
    Write-Host 'NEGATIVE CONTROL: dropping security_invoker so the view bypasses RLS' -ForegroundColor Yellow
    Invoke-Psql -Command @'
drop view public.publication_feed;
create view public.publication_feed as
select p.organisation_id, p.product_id, p.channel, p.public_name, p.public_description,
       p.public_price_amount, p.public_price_currency, p.published_at
  from public.product_publications p
 where p.state = 'published';
'@
  }

  if ($SimulateSeatBypass) {
    Write-Host 'NEGATIVE CONTROL: widening the publish seat list to admit counter' -ForegroundColor Yellow
    # Granting the counter membership an owner seat would NOT bypass anything -
    # the function gates on the acting seat passed in, not on what seats the
    # person happens to hold. To actually break merchant control you have to
    # widen the seat list itself, which is what this does.
    Invoke-Psql -Command @'
create or replace function public.api_publish_product(
  target_org uuid, target_person uuid, target_seat text,
  target_product uuid, publication jsonb, request_identifier uuid default null
) returns jsonb language plpgsql security definer
set search_path = public, app_private, pg_temp as $fn$
declare v_id uuid;
begin
  if not app_private.assert_active_seat(target_org, target_person, target_seat) then
    raise exception 'seat_not_authorized';
  end if;
  if target_seat not in ('owner', 'managing_director', 'director', 'counter') then
    raise exception 'acting_seat_not_legal_for_command';
  end if;
  insert into public.product_publications as pp
    (organisation_id, product_id, channel, public_name, state, published_at)
  values (target_org, target_product, 'hoadhaa',
          coalesce(publication ->> 'public_name', 'x'), 'published', now())
  on conflict (organisation_id, product_id, channel) do update set
    public_name = excluded.public_name, state = 'published', published_at = now(), revoked_at = null
  returning pp.id into v_id;
  insert into public.audit_events
    (organisation_id, actor_person_id, acting_seat, action, object_type, object_id)
  values (target_org, target_person, target_seat, 'erp.publish', 'publication', v_id);
  return jsonb_build_object('ok', true, 'state', 'published');
end
$fn$;
'@
  }

  if ($SimulateHardDelete) {
    Write-Host 'NEGATIVE CONTROL: making revocation destroy the record' -ForegroundColor Yellow
    Invoke-Psql -Command @'
create or replace function public.api_revoke_publication(
  target_org uuid, target_person uuid, target_seat text,
  target_product uuid, request_identifier uuid default null
) returns jsonb language plpgsql security definer
set search_path = public, app_private, pg_temp as $fn$
declare v_id uuid; v_before jsonb;
begin
  select pp.id, to_jsonb(pp) into v_id, v_before from public.product_publications pp
   where pp.organisation_id = target_org and pp.product_id = target_product and pp.channel = 'hoadhaa';
  if v_id is null then raise exception 'publication_not_found'; end if;
  delete from public.product_publications where id = v_id;
  insert into public.audit_events
    (organisation_id, actor_person_id, acting_seat, action, object_type, object_id, before_state)
  values (target_org, target_person, target_seat, 'erp.unpublish', 'publication', v_id, v_before);
  return jsonb_build_object('ok', true, 'state', 'revoked');
end
$fn$;
'@
  }

  Invoke-Psql -File '/workspace/tests/publication_boundary_probe.sql'

  Write-Host 'SERP-125 publication boundary probe: PASS' -ForegroundColor Green
} finally {
  if ($started) {
    & docker stop $containerName *> $null
  }
}
