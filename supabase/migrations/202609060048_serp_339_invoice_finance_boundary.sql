begin;

-- SERP-339 Item 5: expose the authoritative tax evaluator to the Edge
-- service-role client without exposing the app_private schema to tenants.
-- The evaluator remains in app_private; this wrapper is the supported RPC
-- surface used by starq-api before an INVOICE command is posted.
create or replace function public.calculate_line_tax(
  target_org uuid,
  target_tax_type text,
  supply_date date,
  tax_mode text,
  line_amount numeric
)
returns table (
  is_taxable boolean,
  tax_rate numeric(6, 4),
  base_amount numeric(14, 2),
  tax_amount numeric(14, 2),
  gross_amount numeric(14, 2),
  err_msg text
) language sql security definer
set search_path = public, app_private, extensions, pg_temp as $$
  select * from app_private.calculate_line_tax(
    target_org,
    target_tax_type,
    supply_date,
    tax_mode,
    line_amount
  );
$$;

revoke all on function public.calculate_line_tax(uuid, text, date, text, numeric)
  from public, anon, authenticated;
grant execute on function public.calculate_line_tax(uuid, text, date, text, numeric)
  to service_role;

commit;
