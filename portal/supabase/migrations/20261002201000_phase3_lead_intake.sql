begin;

alter table public.leads
  add column if not exists dedupe_hash text,
  add column if not exists converted_org_id uuid references public.organizations(id) on delete set null;

create index if not exists leads_dedupe_created_idx
on public.leads (dedupe_hash, created_at desc)
where dedupe_hash is not null;

create index if not exists leads_converted_org_idx
on public.leads (converted_org_id)
where converted_org_id is not null;

create table public.lead_intake_rate_limits (
  fingerprint_hash text not null,
  window_start timestamptz not null,
  attempts integer not null default 1 check (attempts > 0),
  last_at timestamptz not null default now(),
  primary key (fingerprint_hash, window_start)
);

alter table public.lead_intake_rate_limits enable row level security;

create or replace function public.consume_lead_intake_rate_limit(
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
  if p_fingerprint_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_fingerprint_hash' using errcode = '22023';
  end if;

  if p_max_attempts < 1 then
    raise exception 'invalid_rate_limit' using errcode = '22023';
  end if;

  insert into public.lead_intake_rate_limits (
    fingerprint_hash,
    window_start,
    attempts,
    last_at
  )
  values (
    p_fingerprint_hash,
    p_window_start,
    1,
    now()
  )
  on conflict (fingerprint_hash, window_start)
  do update set
    attempts = public.lead_intake_rate_limits.attempts + 1,
    last_at = now()
  returning attempts into current_attempts;

  delete from public.lead_intake_rate_limits
  where window_start < now() - interval '2 days';

  return current_attempts <= p_max_attempts;
end;
$$;

create or replace function public.ingest_portal_lead(
  p_payload jsonb,
  p_dedupe_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_lead_id uuid;
  new_lead_id uuid;
  channels_array text[];
  consent_value boolean;
begin
  if p_dedupe_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_dedupe_hash' using errcode = '22023';
  end if;

  consent_value := coalesce((p_payload ->> 'consent')::boolean, false);

  if consent_value is not true then
    raise exception 'consent_required' using errcode = '22023';
  end if;

  select id
  into existing_lead_id
  from public.leads
  where dedupe_hash = p_dedupe_hash
    and created_at >= now() - interval '15 minutes'
  order by created_at desc
  limit 1;

  if existing_lead_id is not null then
    insert into public.lead_events (lead_id, event_type, payload)
    values (
      existing_lead_id,
      'lead.duplicate_suppressed',
      jsonb_build_object('at', now())
    );

    return existing_lead_id;
  end if;

  select coalesce(array_agg(channel_value), '{}'::text[])
  into channels_array
  from jsonb_array_elements_text(coalesce(p_payload -> 'channels', '[]'::jsonb)) as channel(channel_value);

  insert into public.leads (
    status,
    name,
    email,
    phone,
    company,
    website,
    revenue_range,
    business_type,
    accounting_software,
    monthly_transactions_range,
    entities_count,
    channels,
    current_books_state,
    start_timeline,
    consent,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_term,
    utm_content,
    landing_page,
    referrer,
    routing_outcome,
    suggested_tier,
    raw_payload,
    dedupe_hash
  )
  values (
    case
      when p_payload ->> 'routing_outcome' = 'not_a_fit' then 'not_fit'::public.lead_status
      else 'new'::public.lead_status
    end,
    p_payload ->> 'name',
    lower(p_payload ->> 'email'),
    nullif(p_payload ->> 'phone', ''),
    p_payload ->> 'company',
    nullif(p_payload ->> 'website', ''),
    nullif(p_payload ->> 'revenue_range', ''),
    nullif(p_payload ->> 'business_type', ''),
    nullif(p_payload ->> 'accounting_software', ''),
    nullif(p_payload ->> 'monthly_transactions_range', ''),
    nullif(p_payload ->> 'entities_count', '')::integer,
    channels_array,
    nullif(p_payload ->> 'current_books_state', ''),
    nullif(p_payload ->> 'start_timeline', ''),
    consent_value,
    nullif(p_payload ->> 'utm_source', ''),
    nullif(p_payload ->> 'utm_medium', ''),
    nullif(p_payload ->> 'utm_campaign', ''),
    nullif(p_payload ->> 'utm_term', ''),
    nullif(p_payload ->> 'utm_content', ''),
    nullif(p_payload ->> 'landing_page', ''),
    nullif(p_payload ->> 'referrer', ''),
    nullif(p_payload ->> 'routing_outcome', ''),
    nullif(p_payload ->> 'suggested_tier', ''),
    p_payload,
    p_dedupe_hash
  )
  returning id into new_lead_id;

  insert into public.lead_events (lead_id, event_type, payload)
  values (
    new_lead_id,
    'lead.created',
    jsonb_build_object(
      'routing_outcome', p_payload ->> 'routing_outcome',
      'suggested_tier', p_payload ->> 'suggested_tier'
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
  values (
    null,
    null,
    'lead.created',
    'lead',
    new_lead_id,
    jsonb_build_object(
      'routing_outcome', p_payload ->> 'routing_outcome',
      'suggested_tier', p_payload ->> 'suggested_tier'
    )
  );

  return new_lead_id;
end;
$$;

create or replace function public.update_portal_lead_status(
  p_lead_id uuid,
  p_status public.lead_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  old_status public.lead_status;
begin
  if actor_id is null or not public.is_portal_staff() then
    raise exception 'staff_required' using errcode = '42501';
  end if;

  if p_status = 'converted' then
    raise exception 'use_convert_lead_action' using errcode = '22023';
  end if;

  select status
  into old_status
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'lead_not_found' using errcode = 'P0002';
  end if;

  if old_status = 'converted' then
    raise exception 'converted_lead_locked' using errcode = '22023';
  end if;

  update public.leads
  set status = p_status
  where id = p_lead_id;

  insert into public.lead_events (lead_id, event_type, payload)
  values (
    p_lead_id,
    'lead.status_changed',
    jsonb_build_object(
      'old_status', old_status,
      'new_status', p_status,
      'actor_user_id', actor_id
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
  values (
    null,
    actor_id,
    'lead.status_changed',
    'lead',
    p_lead_id,
    jsonb_build_object(
      'old_status', old_status,
      'new_status', p_status
    )
  );
end;
$$;

create or replace function public.convert_portal_lead(
  p_lead_id uuid,
  p_organization_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_lead public.leads%rowtype;
  new_org_id uuid;
begin
  if actor_id is null or not public.is_portal_staff() then
    raise exception 'staff_required' using errcode = '42501';
  end if;

  if nullif(btrim(p_organization_name), '') is null then
    raise exception 'organization_name_required' using errcode = '22023';
  end if;

  select *
  into target_lead
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'lead_not_found' using errcode = 'P0002';
  end if;

  if target_lead.status = 'converted' or target_lead.converted_org_id is not null then
    raise exception 'lead_already_converted' using errcode = '22023';
  end if;

  insert into public.organizations (name)
  values (btrim(p_organization_name))
  returning id into new_org_id;

  insert into public.organization_memberships (org_id, user_id, role, status)
  values (new_org_id, actor_id, 'owner', 'active');

  update public.leads
  set
    status = 'converted',
    converted_org_id = new_org_id
  where id = p_lead_id;

  insert into public.lead_events (lead_id, event_type, payload)
  values (
    p_lead_id,
    'lead.converted',
    jsonb_build_object(
      'org_id', new_org_id,
      'actor_user_id', actor_id
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
  values
    (
      new_org_id,
      actor_id,
      'organization.created',
      'organization',
      new_org_id,
      jsonb_build_object('source', 'lead', 'lead_id', p_lead_id)
    ),
    (
      new_org_id,
      actor_id,
      'lead.converted',
      'lead',
      p_lead_id,
      jsonb_build_object('org_id', new_org_id)
    );

  return new_org_id;
end;
$$;

revoke all on function public.consume_lead_intake_rate_limit(text, timestamptz, integer) from public;
revoke all on function public.ingest_portal_lead(jsonb, text) from public;
revoke all on function public.update_portal_lead_status(uuid, public.lead_status) from public;
revoke all on function public.convert_portal_lead(uuid, text) from public;

grant execute on function public.consume_lead_intake_rate_limit(text, timestamptz, integer) to service_role;
grant execute on function public.ingest_portal_lead(jsonb, text) to service_role;
grant execute on function public.update_portal_lead_status(uuid, public.lead_status) to authenticated;
grant execute on function public.convert_portal_lead(uuid, text) to authenticated;

commit;
