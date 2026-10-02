begin;

create table public.portal_rate_limits (
  scope text not null,
  fingerprint_hash text not null,
  window_start timestamptz not null,
  attempts integer not null default 1 check (attempts > 0),
  last_at timestamptz not null default now(),
  primary key (scope, fingerprint_hash, window_start)
);

alter table public.portal_rate_limits enable row level security;

create index portal_rate_limits_last_at_idx
on public.portal_rate_limits (last_at desc);

create or replace function public.consume_portal_rate_limit(
  p_scope text,
  p_fingerprint_hash text,
  p_window_start timestamptz,
  p_max_attempts integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_attempts integer;
begin
  if nullif(btrim(p_scope), '') is null or length(p_scope) > 80 then
    raise exception 'invalid_rate_limit_scope' using errcode = '22023';
  end if;

  if p_fingerprint_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_fingerprint_hash' using errcode = '22023';
  end if;

  if p_max_attempts < 1 or p_max_attempts > 1000 then
    raise exception 'invalid_rate_limit' using errcode = '22023';
  end if;

  insert into public.portal_rate_limits (
    scope,
    fingerprint_hash,
    window_start,
    attempts,
    last_at
  )
  values (
    btrim(p_scope),
    p_fingerprint_hash,
    p_window_start,
    1,
    now()
  )
  on conflict (scope, fingerprint_hash, window_start)
  do update set
    attempts = public.portal_rate_limits.attempts + 1,
    last_at = now()
  returning attempts into current_attempts;

  delete from public.portal_rate_limits
  where last_at < now() - interval '2 days';

  return current_attempts <= p_max_attempts;
end;
$$;

revoke all on function public.consume_portal_rate_limit(text, text, timestamptz, integer) from public;
grant execute on function public.consume_portal_rate_limit(text, text, timestamptz, integer) to service_role;

commit;
