begin;

alter table public.proposals
  add column if not exists proposal_series_id uuid,
  add column if not exists supersedes_proposal_id uuid references public.proposals(id) on delete restrict,
  add column if not exists decline_reason text,
  add column if not exists declined_by uuid references auth.users(id) on delete set null;

update public.proposals
set proposal_series_id = id
where proposal_series_id is null;

alter table public.proposals
  alter column proposal_series_id set not null;

alter table public.proposal_acceptances
  add column if not exists proposal_snapshot jsonb;

update public.proposal_acceptances pa
set proposal_snapshot = jsonb_build_object(
  'proposal_id', p.id,
  'proposal_series_id', p.proposal_series_id,
  'version', p.version,
  'title', p.title,
  'currency', p.currency,
  'subtotal_cents', p.subtotal_cents,
  'terms_text', p.terms_text,
  'line_items', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'position', li.position,
        'label', li.label,
        'description', li.description,
        'quantity', li.quantity,
        'unit_price_cents', li.unit_price_cents,
        'amount_cents', li.amount_cents
      )
      order by li.position
    )
    from public.proposal_line_items li
    where li.proposal_id = p.id
  ), '[]'::jsonb)
)
from public.proposals p
where p.id = pa.proposal_id
  and pa.proposal_snapshot is null;

alter table public.proposal_acceptances
  alter column proposal_snapshot set not null;

create unique index if not exists proposals_series_version_unique
on public.proposals (proposal_series_id, version);

create unique index if not exists proposals_one_accepted_version_per_series
on public.proposals (proposal_series_id)
where status = 'accepted';

create index if not exists proposals_series_created_idx
on public.proposals (proposal_series_id, created_at desc);

drop policy if exists proposals_select_member on public.proposals;
drop policy if exists proposals_manage_staff on public.proposals;
drop policy if exists proposal_line_items_select_member on public.proposal_line_items;
drop policy if exists proposal_line_items_manage_staff on public.proposal_line_items;

create policy proposals_select_scoped on public.proposals
for select to authenticated
using (
  public.can_manage_org(org_id)
  or (
    public.org_role(org_id) = 'client'
    and status <> 'draft'
  )
);

create policy proposal_line_items_select_scoped on public.proposal_line_items
for select to authenticated
using (
  exists (
    select 1
    from public.proposals p
    where p.id = proposal_id
      and (
        public.can_manage_org(p.org_id)
        or (
          public.org_role(p.org_id) = 'client'
          and p.status <> 'draft'
        )
      )
  )
);

create or replace function public.create_portal_proposal(
  p_org_id uuid,
  p_lead_id uuid,
  p_title text,
  p_currency text,
  p_terms_text text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  new_proposal_id uuid := gen_random_uuid();
begin
  if actor_id is null or not public.can_manage_org(p_org_id) then
    raise exception 'manager_required' using errcode = '42501';
  end if;

  if nullif(btrim(p_title), '') is null then
    raise exception 'proposal_title_required' using errcode = '22023';
  end if;

  if upper(p_currency) !~ '^[A-Z]{3}$' then
    raise exception 'invalid_currency' using errcode = '22023';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'expiration_must_be_future' using errcode = '22023';
  end if;

  if p_lead_id is not null and not exists (
    select 1
    from public.leads l
    where l.id = p_lead_id
      and l.converted_org_id = p_org_id
  ) then
    raise exception 'lead_not_linked_to_organization' using errcode = '22023';
  end if;

  insert into public.proposals (
    id,
    proposal_series_id,
    org_id,
    lead_id,
    status,
    title,
    currency,
    subtotal_cents,
    terms_text,
    expires_at,
    version,
    created_by
  )
  values (
    new_proposal_id,
    new_proposal_id,
    p_org_id,
    p_lead_id,
    'draft',
    btrim(p_title),
    upper(p_currency)::char(3),
    0,
    coalesce(p_terms_text, ''),
    p_expires_at,
    1,
    actor_id
  );

  insert into public.audit_logs (
    org_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_org_id,
    actor_id,
    'proposal.created',
    'proposal',
    new_proposal_id,
    jsonb_build_object('version', 1, 'lead_id', p_lead_id)
  );

  return new_proposal_id;
end;
$$;

create or replace function public.update_portal_proposal_draft(
  p_proposal_id uuid,
  p_title text,
  p_currency text,
  p_terms_text text,
  p_expires_at timestamptz,
  p_line_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_proposal public.proposals%rowtype;
  item jsonb;
  item_position integer := 0;
  item_quantity numeric(12,2);
  item_unit_price_cents integer;
  item_amount_cents integer;
  new_subtotal integer := 0;
begin
  select *
  into target_proposal
  from public.proposals
  where id = p_proposal_id
  for update;

  if not found then
    raise exception 'proposal_not_found' using errcode = 'P0002';
  end if;

  if actor_id is null or not public.can_manage_org(target_proposal.org_id) then
    raise exception 'manager_required' using errcode = '42501';
  end if;

  if target_proposal.status <> 'draft' then
    raise exception 'sent_proposal_locked' using errcode = '22023';
  end if;

  if nullif(btrim(p_title), '') is null then
    raise exception 'proposal_title_required' using errcode = '22023';
  end if;

  if upper(p_currency) !~ '^[A-Z]{3}$' then
    raise exception 'invalid_currency' using errcode = '22023';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'expiration_must_be_future' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_line_items, '[]'::jsonb)) <> 'array' then
    raise exception 'line_items_must_be_array' using errcode = '22023';
  end if;

  delete from public.proposal_line_items
  where proposal_id = p_proposal_id;

  for item in
    select value
    from jsonb_array_elements(coalesce(p_line_items, '[]'::jsonb))
  loop
    if nullif(btrim(item ->> 'label'), '') is null then
      raise exception 'line_item_label_required' using errcode = '22023';
    end if;

    item_quantity := (item ->> 'quantity')::numeric(12,2);
    item_unit_price_cents := (item ->> 'unit_price_cents')::integer;

    if item_quantity <= 0 then
      raise exception 'line_item_quantity_invalid' using errcode = '22023';
    end if;

    if item_unit_price_cents < 0 then
      raise exception 'line_item_price_invalid' using errcode = '22023';
    end if;

    item_amount_cents := round(item_quantity * item_unit_price_cents)::integer;

    insert into public.proposal_line_items (
      proposal_id,
      position,
      label,
      description,
      quantity,
      unit_price_cents,
      amount_cents
    )
    values (
      p_proposal_id,
      item_position,
      btrim(item ->> 'label'),
      nullif(btrim(item ->> 'description'), ''),
      item_quantity,
      item_unit_price_cents,
      item_amount_cents
    );

    new_subtotal := new_subtotal + item_amount_cents;
    item_position := item_position + 1;
  end loop;

  update public.proposals
  set
    title = btrim(p_title),
    currency = upper(p_currency)::char(3),
    subtotal_cents = new_subtotal,
    terms_text = coalesce(p_terms_text, ''),
    expires_at = p_expires_at
  where id = p_proposal_id;

  insert into public.audit_logs (
    org_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_proposal.org_id,
    actor_id,
    'proposal.updated',
    'proposal',
    p_proposal_id,
    jsonb_build_object(
      'version', target_proposal.version,
      'line_item_count', item_position,
      'subtotal_cents', new_subtotal
    )
  );

  return new_subtotal;
end;
$$;

create or replace function public.send_portal_proposal(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_proposal public.proposals%rowtype;
begin
  select *
  into target_proposal
  from public.proposals
  where id = p_proposal_id
  for update;

  if not found then
    raise exception 'proposal_not_found' using errcode = 'P0002';
  end if;

  if actor_id is null or not public.can_manage_org(target_proposal.org_id) then
    raise exception 'manager_required' using errcode = '42501';
  end if;

  if target_proposal.status <> 'draft' then
    raise exception 'proposal_not_draft' using errcode = '22023';
  end if;

  if target_proposal.expires_at is not null and target_proposal.expires_at <= now() then
    raise exception 'proposal_expired_before_send' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.proposal_line_items li
    where li.proposal_id = p_proposal_id
  ) then
    raise exception 'proposal_requires_line_items' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.proposals p
    where p.proposal_series_id = target_proposal.proposal_series_id
      and p.status = 'accepted'
  ) then
    raise exception 'proposal_series_already_accepted' using errcode = '22023';
  end if;

  insert into public.audit_logs (
    org_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  select
    p.org_id,
    actor_id,
    'proposal.expired',
    'proposal',
    p.id,
    jsonb_build_object('reason', 'superseded', 'superseded_by', p_proposal_id)
  from public.proposals p
  where p.proposal_series_id = target_proposal.proposal_series_id
    and p.id <> p_proposal_id
    and p.status in ('sent', 'viewed');

  update public.proposals
  set status = 'expired'
  where proposal_series_id = target_proposal.proposal_series_id
    and id <> p_proposal_id
    and status in ('sent', 'viewed');

  update public.proposals
  set
    status = 'sent',
    sent_at = now(),
    viewed_at = null,
    declined_at = null,
    declined_by = null,
    decline_reason = null
  where id = p_proposal_id;

  insert into public.audit_logs (
    org_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_proposal.org_id,
    actor_id,
    'proposal.sent',
    'proposal',
    p_proposal_id,
    jsonb_build_object(
      'version', target_proposal.version,
      'subtotal_cents', target_proposal.subtotal_cents
    )
  );
end;
$$;

create or replace function public.create_portal_proposal_version(p_proposal_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  source_proposal public.proposals%rowtype;
  new_proposal_id uuid := gen_random_uuid();
  new_version integer;
begin
  select *
  into source_proposal
  from public.proposals
  where id = p_proposal_id
  for update;

  if not found then
    raise exception 'proposal_not_found' using errcode = 'P0002';
  end if;

  if actor_id is null or not public.can_manage_org(source_proposal.org_id) then
    raise exception 'manager_required' using errcode = '42501';
  end if;

  if source_proposal.status in ('draft', 'accepted') then
    raise exception 'proposal_version_not_allowed' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.proposals p
    where p.proposal_series_id = source_proposal.proposal_series_id
      and p.status = 'draft'
  ) then
    raise exception 'proposal_series_has_draft' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.proposals p
    where p.proposal_series_id = source_proposal.proposal_series_id
      and p.status = 'accepted'
  ) then
    raise exception 'proposal_series_already_accepted' using errcode = '22023';
  end if;

  select max(version) + 1
  into new_version
  from public.proposals
  where proposal_series_id = source_proposal.proposal_series_id;

  insert into public.proposals (
    id,
    proposal_series_id,
    supersedes_proposal_id,
    org_id,
    lead_id,
    status,
    title,
    currency,
    subtotal_cents,
    terms_text,
    expires_at,
    version,
    created_by
  )
  values (
    new_proposal_id,
    source_proposal.proposal_series_id,
    source_proposal.id,
    source_proposal.org_id,
    source_proposal.lead_id,
    'draft',
    source_proposal.title,
    source_proposal.currency,
    source_proposal.subtotal_cents,
    source_proposal.terms_text,
    case
      when source_proposal.expires_at is not null and source_proposal.expires_at > now()
        then source_proposal.expires_at
      else null
    end,
    new_version,
    actor_id
  );

  insert into public.proposal_line_items (
    proposal_id,
    position,
    label,
    description,
    quantity,
    unit_price_cents,
    amount_cents
  )
  select
    new_proposal_id,
    position,
    label,
    description,
    quantity,
    unit_price_cents,
    amount_cents
  from public.proposal_line_items
  where proposal_id = source_proposal.id
  order by position;

  insert into public.audit_logs (
    org_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    source_proposal.org_id,
    actor_id,
    'proposal.created',
    'proposal',
    new_proposal_id,
    jsonb_build_object(
      'version', new_version,
      'supersedes_proposal_id', source_proposal.id
    )
  );

  return new_proposal_id;
end;
$$;

create or replace function public.mark_portal_proposal_viewed(p_proposal_id uuid)
returns public.proposal_status
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_proposal public.proposals%rowtype;
begin
  select *
  into target_proposal
  from public.proposals
  where id = p_proposal_id
  for update;

  if not found then
    raise exception 'proposal_not_found' using errcode = 'P0002';
  end if;

  if actor_id is null
     or public.org_role(target_proposal.org_id) <> 'client' then
    raise exception 'client_membership_required' using errcode = '42501';
  end if;

  if target_proposal.status in ('sent', 'viewed')
     and target_proposal.expires_at is not null
     and target_proposal.expires_at <= now() then
    update public.proposals
    set status = 'expired'
    where id = p_proposal_id;

    insert into public.audit_logs (
      org_id,
      actor_user_id,
      event_type,
      entity_type,
      entity_id,
      metadata
    )
    values (
      target_proposal.org_id,
      actor_id,
      'proposal.expired',
      'proposal',
      p_proposal_id,
      jsonb_build_object('reason', 'expiration_date')
    );

    return 'expired';
  end if;

  if target_proposal.status = 'sent' then
    update public.proposals
    set
      status = 'viewed',
      viewed_at = coalesce(viewed_at, now())
    where id = p_proposal_id;

    insert into public.audit_logs (
      org_id,
      actor_user_id,
      event_type,
      entity_type,
      entity_id,
      metadata
    )
    values (
      target_proposal.org_id,
      actor_id,
      'proposal.viewed',
      'proposal',
      p_proposal_id,
      jsonb_build_object('version', target_proposal.version)
    );

    return 'viewed';
  end if;

  return target_proposal.status;
end;
$$;

create or replace function public.accept_portal_proposal(
  p_proposal_id uuid,
  p_accepted_name text,
  p_acceptance_confirmed boolean,
  p_ip_address inet,
  p_user_agent text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  target_proposal public.proposals%rowtype;
  acceptance_id uuid;
  snapshot jsonb;
  acceptance_statement constant text :=
    'I have reviewed this proposal, including its line items, total, and terms, and I accept it on behalf of the organization.';
begin
  select *
  into target_proposal
  from public.proposals
  where id = p_proposal_id
  for update;

  if not found then
    raise exception 'proposal_not_found' using errcode = 'P0002';
  end if;

  if actor_id is null
     or actor_email = ''
     or public.org_role(target_proposal.org_id) <> 'client' then
    raise exception 'client_membership_required' using errcode = '42501';
  end if;

  if p_acceptance_confirmed is not true then
    raise exception 'explicit_acceptance_required' using errcode = '22023';
  end if;

  if nullif(btrim(p_accepted_name), '') is null then
    raise exception 'accepted_name_required' using errcode = '22023';
  end if;

  if target_proposal.status not in ('sent', 'viewed') then
    raise exception 'proposal_not_acceptible' using errcode = '22023';
  end if;

  if target_proposal.expires_at is not null and target_proposal.expires_at <= now() then
    raise exception 'proposal_expired' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.proposals p
    where p.proposal_series_id = target_proposal.proposal_series_id
      and p.status = 'accepted'
  ) then
    raise exception 'proposal_series_already_accepted' using errcode = '22023';
  end if;

  snapshot := jsonb_build_object(
    'proposal_id', target_proposal.id,
    'proposal_series_id', target_proposal.proposal_series_id,
    'version', target_proposal.version,
    'org_id', target_proposal.org_id,
    'lead_id', target_proposal.lead_id,
    'title', target_proposal.title,
    'currency', target_proposal.currency,
    'subtotal_cents', target_proposal.subtotal_cents,
    'terms_text', target_proposal.terms_text,
    'expires_at', target_proposal.expires_at,
    'line_items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'position', li.position,
          'label', li.label,
          'description', li.description,
          'quantity', li.quantity,
          'unit_price_cents', li.unit_price_cents,
          'amount_cents', li.amount_cents
        )
        order by li.position
      )
      from public.proposal_line_items li
      where li.proposal_id = target_proposal.id
    ), '[]'::jsonb)
  );

  insert into public.proposal_acceptances (
    proposal_id,
    accepted_by,
    accepted_name,
    accepted_email,
    accepted_at,
    ip_address,
    user_agent,
    acceptance_text_snapshot,
    proposal_snapshot
  )
  values (
    target_proposal.id,
    actor_id,
    btrim(p_accepted_name),
    actor_email,
    now(),
    p_ip_address,
    left(nullif(p_user_agent, ''), 1000),
    acceptance_statement,
    snapshot
  )
  returning id into acceptance_id;

  update public.proposals
  set
    status = 'accepted',
    accepted_at = now()
  where id = target_proposal.id;

  update public.proposals
  set status = 'expired'
  where proposal_series_id = target_proposal.proposal_series_id
    and id <> target_proposal.id
    and status in ('sent', 'viewed');

  insert into public.audit_logs (
    org_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_proposal.org_id,
    actor_id,
    'proposal.accepted',
    'proposal',
    target_proposal.id,
    jsonb_build_object(
      'version', target_proposal.version,
      'acceptance_id', acceptance_id,
      'accepted_name', btrim(p_accepted_name),
      'accepted_email', actor_email
    )
  );

  return acceptance_id;
end;
$$;

create or replace function public.decline_portal_proposal(
  p_proposal_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_proposal public.proposals%rowtype;
begin
  select *
  into target_proposal
  from public.proposals
  where id = p_proposal_id
  for update;

  if not found then
    raise exception 'proposal_not_found' using errcode = 'P0002';
  end if;

  if actor_id is null
     or public.org_role(target_proposal.org_id) <> 'client' then
    raise exception 'client_membership_required' using errcode = '42501';
  end if;

  if target_proposal.status not in ('sent', 'viewed') then
    raise exception 'proposal_not_declineable' using errcode = '22023';
  end if;

  if target_proposal.expires_at is not null and target_proposal.expires_at <= now() then
    raise exception 'proposal_expired' using errcode = '22023';
  end if;

  update public.proposals
  set
    status = 'declined',
    declined_at = now(),
    declined_by = actor_id,
    decline_reason = nullif(left(btrim(coalesce(p_reason, '')), 1000), '')
  where id = target_proposal.id;

  insert into public.audit_logs (
    org_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_proposal.org_id,
    actor_id,
    'proposal.declined',
    'proposal',
    target_proposal.id,
    jsonb_build_object(
      'version', target_proposal.version,
      'reason', nullif(left(btrim(coalesce(p_reason, '')), 1000), '')
    )
  );
end;
$$;

revoke all on function public.create_portal_proposal(uuid, uuid, text, text, text, timestamptz) from public;
revoke all on function public.update_portal_proposal_draft(uuid, text, text, text, timestamptz, jsonb) from public;
revoke all on function public.send_portal_proposal(uuid) from public;
revoke all on function public.create_portal_proposal_version(uuid) from public;
revoke all on function public.mark_portal_proposal_viewed(uuid) from public;
revoke all on function public.accept_portal_proposal(uuid, text, boolean, inet, text) from public;
revoke all on function public.decline_portal_proposal(uuid, text) from public;

grant execute on function public.create_portal_proposal(uuid, uuid, text, text, text, timestamptz) to authenticated;
grant execute on function public.update_portal_proposal_draft(uuid, text, text, text, timestamptz, jsonb) to authenticated;
grant execute on function public.send_portal_proposal(uuid) to authenticated;
grant execute on function public.create_portal_proposal_version(uuid) to authenticated;
grant execute on function public.mark_portal_proposal_viewed(uuid) to authenticated;
grant execute on function public.accept_portal_proposal(uuid, text, boolean, inet, text) to authenticated;
grant execute on function public.decline_portal_proposal(uuid, text) to authenticated;

commit;
