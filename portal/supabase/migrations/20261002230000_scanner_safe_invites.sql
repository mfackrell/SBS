begin;

alter table public.invites
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

update public.invites i
set auth_user_id = u.id
from auth.users u
where i.auth_user_id is null
  and lower(u.email) = lower(i.email);

create index if not exists invites_auth_user_idx
on public.invites (auth_user_id)
where auth_user_id is not null;

create or replace function public.accept_portal_invite_server(
  target_invite_id uuid,
  invite_token text,
  target_user_id uuid,
  accepted_full_name text
)
returns table (
  accepted_org_id uuid,
  accepted_role public.org_role
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_invite public.invites%rowtype;
  token_digest text;
  target_user_email text;
  existing_membership public.organization_memberships%rowtype;
begin
  if nullif(invite_token, '') is null then
    raise exception 'invite_token_required' using errcode = '22023';
  end if;

  if nullif(btrim(accepted_full_name), '') is null then
    raise exception 'full_name_required' using errcode = '22023';
  end if;

  token_digest := encode(digest(invite_token, 'sha256'), 'hex');

  select *
  into target_invite
  from public.invites
  where id = target_invite_id
  for update;

  if not found then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;

  if target_invite.accepted_at is not null then
    raise exception 'invite_already_accepted' using errcode = '22023';
  end if;

  if target_invite.revoked_at is not null then
    raise exception 'invite_revoked' using errcode = '42501';
  end if;

  if target_invite.expires_at <= now() then
    raise exception 'invite_expired' using errcode = '42501';
  end if;

  if target_invite.token_hash <> token_digest then
    raise exception 'invite_token_mismatch' using errcode = '42501';
  end if;

  select lower(u.email)
  into target_user_email
  from auth.users u
  where u.id = target_user_id;

  if target_user_email is null then
    raise exception 'auth_user_not_found' using errcode = 'P0002';
  end if;

  if lower(target_invite.email) <> target_user_email then
    raise exception 'invite_email_mismatch' using errcode = '42501';
  end if;

  if target_invite.auth_user_id is not null
     and target_invite.auth_user_id <> target_user_id then
    raise exception 'invite_user_mismatch' using errcode = '42501';
  end if;

  select *
  into existing_membership
  from public.organization_memberships
  where org_id = target_invite.org_id
    and user_id = target_user_id
  for update;

  if found and existing_membership.status = 'active' then
    raise exception 'already_active_member' using errcode = '22023';
  end if;

  insert into public.profiles (user_id, full_name)
  values (target_user_id, btrim(accepted_full_name))
  on conflict (user_id) do update
  set
    full_name = btrim(excluded.full_name),
    updated_at = now();

  if existing_membership.id is null then
    insert into public.organization_memberships (org_id, user_id, role, status)
    values (target_invite.org_id, target_user_id, target_invite.role, 'active');
  else
    update public.organization_memberships
    set
      role = target_invite.role,
      status = 'active'
    where id = existing_membership.id;
  end if;

  update public.invites
  set
    accepted_at = now(),
    auth_user_id = target_user_id
  where id = target_invite.id;

  insert into public.audit_logs (
    org_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_invite.org_id,
    target_user_id,
    'invite.accepted',
    'invite',
    target_invite.id,
    jsonb_build_object(
      'email', target_invite.email,
      'role', target_invite.role,
      'scanner_safe_flow', true
    )
  );

  insert into public.audit_logs (
    org_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  select
    target_invite.org_id,
    target_user_id,
    'membership.activated',
    'organization_membership',
    m.id,
    jsonb_build_object('role', m.role, 'scanner_safe_flow', true)
  from public.organization_memberships m
  where m.org_id = target_invite.org_id
    and m.user_id = target_user_id;

  return query
  select target_invite.org_id, target_invite.role;
end;
$$;

revoke all on function public.accept_portal_invite_server(uuid, text, uuid, text) from public;
revoke all on function public.accept_portal_invite_server(uuid, text, uuid, text) from anon;
revoke all on function public.accept_portal_invite_server(uuid, text, uuid, text) from authenticated;
grant execute on function public.accept_portal_invite_server(uuid, text, uuid, text) to service_role;

commit;
