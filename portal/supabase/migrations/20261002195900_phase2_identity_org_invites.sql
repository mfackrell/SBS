begin;

create unique index if not exists invites_one_pending_email_per_org_idx
on public.invites (org_id, lower(email))
where accepted_at is null and revoked_at is null;

drop policy if exists memberships_insert_manager on public.organization_memberships;
drop policy if exists memberships_update_manager on public.organization_memberships;
drop policy if exists memberships_delete_manager on public.organization_memberships;
drop policy if exists invites_insert_manager on public.invites;
drop policy if exists invites_update_manager on public.invites;
drop policy if exists invites_delete_manager on public.invites;

create or replace function public.is_org_owner(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.org_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = 'owner'
  );
$$;

create or replace function public.is_portal_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'staff')
  );
$$;

revoke all on function public.is_org_owner(uuid) from public;
revoke all on function public.is_portal_staff() from public;
grant execute on function public.is_org_owner(uuid) to authenticated;
grant execute on function public.is_portal_staff() to authenticated;

create policy profiles_select_org_manager on public.profiles
for select to authenticated
using (
  user_id = public.auth_user_id()
  or exists (
    select 1
    from public.organization_memberships target_membership
    where target_membership.user_id = profiles.user_id
      and public.can_manage_org(target_membership.org_id)
  )
);

create or replace function public.create_portal_organization(organization_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if not public.is_portal_staff() then
    raise exception 'staff_required' using errcode = '42501';
  end if;

  if nullif(btrim(organization_name), '') is null then
    raise exception 'organization_name_required' using errcode = '22023';
  end if;

  insert into public.organizations (name)
  values (btrim(organization_name))
  returning id into new_org_id;

  insert into public.organization_memberships (org_id, user_id, role, status)
  values (new_org_id, actor_id, 'owner', 'active');

  insert into public.audit_logs (
    org_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    new_org_id,
    actor_id,
    'organization.created',
    'organization',
    new_org_id,
    jsonb_build_object('name', btrim(organization_name))
  );

  return new_org_id;
end;
$$;

create or replace function public.create_portal_invite(
  target_org_id uuid,
  invite_email text,
  invite_role public.org_role,
  invite_token_hash text,
  invite_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_invite_id uuid;
  actor_id uuid := auth.uid();
  actor_role public.org_role;
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  actor_role := public.org_role(target_org_id);

  if actor_role is null or actor_role not in ('owner', 'staff') then
    raise exception 'manager_required' using errcode = '42501';
  end if;

  if actor_role = 'staff' and invite_role <> 'client' then
    raise exception 'owner_required_for_staff_invite' using errcode = '42501';
  end if;

  if nullif(btrim(invite_email), '') is null or position('@' in invite_email) <= 1 then
    raise exception 'valid_email_required' using errcode = '22023';
  end if;

  if invite_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_invite_token_hash' using errcode = '22023';
  end if;

  if invite_expires_at <= now() then
    raise exception 'invite_expiration_must_be_future' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.organization_memberships m
    join auth.users u on u.id = m.user_id
    where m.org_id = target_org_id
      and m.status = 'active'
      and lower(u.email) = lower(btrim(invite_email))
  ) then
    raise exception 'user_already_member' using errcode = '22023';
  end if;

  insert into public.invites (
    org_id,
    email,
    role,
    invited_by,
    token_hash,
    expires_at
  )
  values (
    target_org_id,
    lower(btrim(invite_email)),
    invite_role,
    actor_id,
    invite_token_hash,
    invite_expires_at
  )
  returning id into new_invite_id;

  insert into public.audit_logs (
    org_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_org_id,
    actor_id,
    'invite.created',
    'invite',
    new_invite_id,
    jsonb_build_object(
      'email', lower(btrim(invite_email)),
      'role', invite_role
    )
  );

  return new_invite_id;
end;
$$;

create or replace function public.rotate_portal_invite(
  target_invite_id uuid,
  invite_token_hash text,
  invite_expires_at timestamptz
)
returns table (
  invite_id uuid,
  org_id uuid,
  email text,
  role public.org_role
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invite public.invites%rowtype;
  actor_role public.org_role;
begin
  select *
  into target_invite
  from public.invites
  where id = target_invite_id
  for update;

  if not found then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;

  actor_role := public.org_role(target_invite.org_id);

  if actor_role is null or actor_role not in ('owner', 'staff') then
    raise exception 'manager_required' using errcode = '42501';
  end if;

  if actor_role = 'staff' and target_invite.role <> 'client' then
    raise exception 'owner_required_for_staff_invite' using errcode = '42501';
  end if;

  if target_invite.accepted_at is not null then
    raise exception 'invite_already_accepted' using errcode = '22023';
  end if;

  if invite_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_invite_token_hash' using errcode = '22023';
  end if;

  if invite_expires_at <= now() then
    raise exception 'invite_expiration_must_be_future' using errcode = '22023';
  end if;

  update public.invites
  set
    token_hash = invite_token_hash,
    expires_at = invite_expires_at,
    revoked_at = null
  where id = target_invite_id;

  return query
  select
    target_invite.id,
    target_invite.org_id,
    target_invite.email,
    target_invite.role;
end;
$$;

create or replace function public.revoke_portal_invite(target_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invite public.invites%rowtype;
  actor_id uuid := auth.uid();
  actor_role public.org_role;
begin
  select *
  into target_invite
  from public.invites
  where id = target_invite_id
  for update;

  if not found then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;

  actor_role := public.org_role(target_invite.org_id);

  if actor_role is null or actor_role not in ('owner', 'staff') then
    raise exception 'manager_required' using errcode = '42501';
  end if;

  if actor_role = 'staff' and target_invite.role <> 'client' then
    raise exception 'owner_required_for_staff_invite' using errcode = '42501';
  end if;

  if target_invite.accepted_at is not null then
    raise exception 'invite_already_accepted' using errcode = '22023';
  end if;

  update public.invites
  set revoked_at = now()
  where id = target_invite_id;

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
    actor_id,
    'invite.revoked',
    'invite',
    target_invite.id,
    jsonb_build_object('email', target_invite.email, 'role', target_invite.role)
  );
end;
$$;

create or replace function public.accept_portal_invite(
  target_invite_id uuid,
  invite_token text,
  accepted_full_name text
)
returns table (
  accepted_org_id uuid,
  accepted_role public.org_role
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invite public.invites%rowtype;
  actor_id uuid := auth.uid();
  actor_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  token_digest text;
  existing_membership public.organization_memberships%rowtype;
begin
  if actor_id is null or actor_email = '' then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if nullif(invite_token, '') is null then
    raise exception 'invite_token_required' using errcode = '22023';
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

  if lower(target_invite.email) <> actor_email then
    raise exception 'invite_email_mismatch' using errcode = '42501';
  end if;

  if target_invite.token_hash <> token_digest then
    raise exception 'invite_token_mismatch' using errcode = '42501';
  end if;

  select *
  into existing_membership
  from public.organization_memberships
  where org_id = target_invite.org_id
    and user_id = actor_id
  for update;

  if found and existing_membership.status = 'active' then
    raise exception 'already_active_member' using errcode = '22023';
  end if;

  insert into public.profiles (user_id, full_name)
  values (actor_id, nullif(btrim(accepted_full_name), ''))
  on conflict (user_id) do update
  set
    full_name = coalesce(nullif(btrim(excluded.full_name), ''), public.profiles.full_name),
    updated_at = now();

  if existing_membership.id is null then
    insert into public.organization_memberships (org_id, user_id, role, status)
    values (target_invite.org_id, actor_id, target_invite.role, 'active');
  else
    update public.organization_memberships
    set
      role = target_invite.role,
      status = 'active'
    where id = existing_membership.id;
  end if;

  update public.invites
  set accepted_at = now()
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
    actor_id,
    'invite.accepted',
    'invite',
    target_invite.id,
    jsonb_build_object('email', target_invite.email, 'role', target_invite.role)
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
    actor_id,
    'membership.activated',
    'organization_membership',
    m.id,
    jsonb_build_object('role', m.role)
  from public.organization_memberships m
  where m.org_id = target_invite.org_id
    and m.user_id = actor_id;

  return query
  select target_invite.org_id, target_invite.role;
end;
$$;

create or replace function public.update_portal_membership(
  target_membership_id uuid,
  new_role public.org_role,
  new_status public.membership_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_membership public.organization_memberships%rowtype;
  actor_id uuid := auth.uid();
  actor_role public.org_role;
  other_active_owners integer;
begin
  select *
  into target_membership
  from public.organization_memberships
  where id = target_membership_id
  for update;

  if not found then
    raise exception 'membership_not_found' using errcode = 'P0002';
  end if;

  actor_role := public.org_role(target_membership.org_id);

  if actor_role is null or actor_role not in ('owner', 'staff') then
    raise exception 'manager_required' using errcode = '42501';
  end if;

  if actor_role = 'staff' then
    if target_membership.role <> 'client' or new_role <> 'client' then
      raise exception 'staff_can_only_manage_clients' using errcode = '42501';
    end if;
  end if;

  if target_membership.role = 'owner'
     and (new_role <> 'owner' or new_status <> 'active') then
    select count(*)
    into other_active_owners
    from public.organization_memberships
    where org_id = target_membership.org_id
      and id <> target_membership.id
      and role = 'owner'
      and status = 'active';

    if other_active_owners < 1 then
      raise exception 'organization_requires_active_owner' using errcode = '22023';
    end if;
  end if;

  update public.organization_memberships
  set
    role = new_role,
    status = new_status
  where id = target_membership.id;

  insert into public.audit_logs (
    org_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_membership.org_id,
    actor_id,
    'membership.updated',
    'organization_membership',
    target_membership.id,
    jsonb_build_object(
      'old_role', target_membership.role,
      'new_role', new_role,
      'old_status', target_membership.status,
      'new_status', new_status,
      'target_user_id', target_membership.user_id
    )
  );
end;
$$;

revoke all on function public.create_portal_organization(text) from public;
revoke all on function public.create_portal_invite(uuid, text, public.org_role, text, timestamptz) from public;
revoke all on function public.rotate_portal_invite(uuid, text, timestamptz) from public;
revoke all on function public.revoke_portal_invite(uuid) from public;
revoke all on function public.accept_portal_invite(uuid, text, text) from public;
revoke all on function public.update_portal_membership(uuid, public.org_role, public.membership_status) from public;

grant execute on function public.create_portal_organization(text) to authenticated;
grant execute on function public.create_portal_invite(uuid, text, public.org_role, text, timestamptz) to authenticated;
grant execute on function public.rotate_portal_invite(uuid, text, timestamptz) to authenticated;
grant execute on function public.revoke_portal_invite(uuid) to authenticated;
grant execute on function public.accept_portal_invite(uuid, text, text) to authenticated;
grant execute on function public.update_portal_membership(uuid, public.org_role, public.membership_status) to authenticated;

commit;
