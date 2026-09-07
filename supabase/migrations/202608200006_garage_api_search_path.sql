begin;

alter function public.api_garage_command(uuid, uuid, text, uuid, jsonb, uuid)
  set search_path = public, app_private, extensions, pg_temp;

commit;
