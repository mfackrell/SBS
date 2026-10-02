begin;

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
  loop
    execute format('revoke all on function %s from anon', fn.signature);
    execute format('revoke all on function %s from public', fn.signature);
  end loop;
end;
$$;

alter function public.auth_user_id()
  set search_path = public, auth;

commit;
