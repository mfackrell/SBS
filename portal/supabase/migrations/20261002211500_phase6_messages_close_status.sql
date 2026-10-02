begin;

create table public.close_period_events (
  id uuid primary key default gen_random_uuid(),
  close_period_id uuid not null references public.close_periods(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  from_status public.close_status,
  to_status public.close_status not null,
  notes_snapshot text,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index close_period_events_period_created_idx
on public.close_period_events (close_period_id, created_at);

create index close_period_events_org_created_idx
on public.close_period_events (org_id, created_at desc);

alter table public.close_period_events enable row level security;

drop policy if exists threads_select_member on public.threads;
drop policy if exists thread_participants_select_member on public.thread_participants;
drop policy if exists messages_select_member on public.messages;
drop policy if exists close_periods_manage_staff on public.close_periods;

create or replace function public.can_access_thread(target_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.threads t
    where t.id = target_thread_id
      and (
        public.can_manage_org(t.org_id)
        or (
          public.is_org_member(t.org_id)
          and exists (
            select 1
            from public.thread_participants tp
            where tp.thread_id = t.id
              and tp.user_id = auth.uid()
          )
        )
      )
  );
$$;

revoke all on function public.can_access_thread(uuid) from public;
grant execute on function public.can_access_thread(uuid) to authenticated;

create policy threads_select_accessible on public.threads
for select to authenticated
using (public.can_access_thread(id));

create policy thread_participants_select_accessible on public.thread_participants
for select to authenticated
using (public.can_access_thread(thread_id));

create policy messages_select_accessible on public.messages
for select to authenticated
using (public.can_access_thread(thread_id));

create policy close_period_events_select_member on public.close_period_events
for select to authenticated
using (public.is_org_member(org_id));

create or replace function public.create_portal_thread(
  p_org_id uuid,
  p_subject text,
  p_initial_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  new_thread_id uuid;
  new_message_id uuid;
begin
  if actor_id is null or not public.is_org_member(p_org_id) then
    raise exception 'organization_membership_required' using errcode = '42501';
  end if;

  if nullif(btrim(p_subject), '') is null or length(btrim(p_subject)) > 180 then
    raise exception 'invalid_thread_subject' using errcode = '22023';
  end if;

  if nullif(btrim(p_initial_body), '') is null or length(btrim(p_initial_body)) > 10000 then
    raise exception 'invalid_message_body' using errcode = '22023';
  end if;

  insert into public.threads (org_id, subject, created_by)
  values (p_org_id, btrim(p_subject), actor_id)
  returning id into new_thread_id;

  insert into public.thread_participants (thread_id, user_id)
  select new_thread_id, m.user_id
  from public.organization_memberships m
  where m.org_id = p_org_id
    and m.status = 'active'
  on conflict (thread_id, user_id) do nothing;

  insert into public.messages (thread_id, sender_id, body, attachments)
  values (new_thread_id, actor_id, btrim(p_initial_body), null)
  returning id into new_message_id;

  insert into public.message_reads (message_id, user_id, read_at)
  values (new_message_id, actor_id, now())
  on conflict (message_id, user_id) do update set read_at = excluded.read_at;

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
    'thread.created',
    'thread',
    new_thread_id,
    jsonb_build_object('initial_message_id', new_message_id)
  );

  return new_thread_id;
end;
$$;

create or replace function public.send_portal_message(
  p_thread_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_org_id uuid;
  new_message_id uuid;
begin
  if actor_id is null or not public.can_access_thread(p_thread_id) then
    raise exception 'thread_access_required' using errcode = '42501';
  end if;

  if nullif(btrim(p_body), '') is null or length(btrim(p_body)) > 10000 then
    raise exception 'invalid_message_body' using errcode = '22023';
  end if;

  select org_id
  into target_org_id
  from public.threads
  where id = p_thread_id;

  insert into public.thread_participants (thread_id, user_id)
  values (p_thread_id, actor_id)
  on conflict (thread_id, user_id) do nothing;

  insert into public.messages (thread_id, sender_id, body, attachments)
  values (p_thread_id, actor_id, btrim(p_body), null)
  returning id into new_message_id;

  insert into public.message_reads (message_id, user_id, read_at)
  values (new_message_id, actor_id, now())
  on conflict (message_id, user_id) do update set read_at = excluded.read_at;

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
    'message.sent',
    'message',
    new_message_id,
    jsonb_build_object('thread_id', p_thread_id)
  );

  return new_message_id;
end;
$$;

create or replace function public.mark_portal_thread_read(p_thread_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  affected integer := 0;
begin
  if actor_id is null or not public.can_access_thread(p_thread_id) then
    raise exception 'thread_access_required' using errcode = '42501';
  end if;

  insert into public.message_reads (message_id, user_id, read_at)
  select
    m.id,
    actor_id,
    now()
  from public.messages m
  where m.thread_id = p_thread_id
    and m.sender_id <> actor_id
  on conflict (message_id, user_id) do update
  set read_at = excluded.read_at;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.get_portal_unread_message_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.messages m
  where m.sender_id <> auth.uid()
    and public.can_access_thread(m.thread_id)
    and not exists (
      select 1
      from public.message_reads mr
      where mr.message_id = m.id
        and mr.user_id = auth.uid()
    );
$$;

create or replace function public.portal_thread_summaries()
returns table (
  thread_id uuid,
  org_id uuid,
  org_name text,
  subject text,
  created_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.org_id,
    o.name,
    t.subject,
    t.created_at,
    lm.created_at,
    lm.body,
    (
      select count(*)
      from public.messages unread_message
      where unread_message.thread_id = t.id
        and unread_message.sender_id <> auth.uid()
        and not exists (
          select 1
          from public.message_reads mr
          where mr.message_id = unread_message.id
            and mr.user_id = auth.uid()
        )
    )::bigint
  from public.threads t
  join public.organizations o on o.id = t.org_id
  left join lateral (
    select m.created_at, left(m.body, 180) as body
    from public.messages m
    where m.thread_id = t.id
    order by m.created_at desc
    limit 1
  ) lm on true
  where public.can_access_thread(t.id)
  order by coalesce(lm.created_at, t.created_at) desc;
$$;

create or replace function public.create_portal_close_period(
  p_org_id uuid,
  p_period_label text,
  p_period_start date,
  p_period_end date,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  new_period_id uuid;
begin
  if actor_id is null or not public.can_manage_org(p_org_id) then
    raise exception 'manager_required' using errcode = '42501';
  end if;

  if nullif(btrim(p_period_label), '') is null or length(btrim(p_period_label)) > 120 then
    raise exception 'invalid_period_label' using errcode = '22023';
  end if;

  if p_period_start <> date_trunc('month', p_period_start)::date
     or p_period_end <> (date_trunc('month', p_period_start) + interval '1 month - 1 day')::date then
    raise exception 'close_period_must_cover_calendar_month' using errcode = '22023';
  end if;

  insert into public.close_periods (
    org_id,
    period_label,
    period_start,
    period_end,
    status,
    notes
  )
  values (
    p_org_id,
    btrim(p_period_label),
    p_period_start,
    p_period_end,
    'pending_records',
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id into new_period_id;

  insert into public.close_period_events (
    close_period_id,
    org_id,
    from_status,
    to_status,
    notes_snapshot,
    changed_by
  )
  values (
    new_period_id,
    p_org_id,
    null,
    'pending_records',
    nullif(btrim(coalesce(p_notes, '')), ''),
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
    'close.created',
    'close_period',
    new_period_id,
    jsonb_build_object(
      'period_label', btrim(p_period_label),
      'period_start', p_period_start,
      'period_end', p_period_end,
      'status', 'pending_records'
    )
  );

  return new_period_id;
end;
$$;

create or replace function public.update_portal_close_period(
  p_close_period_id uuid,
  p_status public.close_status,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_period public.close_periods%rowtype;
  clean_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  select *
  into target_period
  from public.close_periods
  where id = p_close_period_id
  for update;

  if not found then
    raise exception 'close_period_not_found' using errcode = 'P0002';
  end if;

  if actor_id is null or not public.can_manage_org(target_period.org_id) then
    raise exception 'manager_required' using errcode = '42501';
  end if;

  if target_period.status = p_status
     and target_period.notes is not distinct from clean_notes then
    return;
  end if;

  update public.close_periods
  set
    status = p_status,
    notes = clean_notes
  where id = p_close_period_id;

  insert into public.close_period_events (
    close_period_id,
    org_id,
    from_status,
    to_status,
    notes_snapshot,
    changed_by
  )
  values (
    target_period.id,
    target_period.org_id,
    target_period.status,
    p_status,
    clean_notes,
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
    target_period.org_id,
    actor_id,
    case
      when target_period.status is distinct from p_status then 'close.status_changed'
      else 'close.notes_updated'
    end,
    'close_period',
    target_period.id,
    jsonb_build_object(
      'period_label', target_period.period_label,
      'old_status', target_period.status,
      'new_status', p_status
    )
  );
end;
$$;

revoke all on function public.create_portal_thread(uuid, text, text) from public;
revoke all on function public.send_portal_message(uuid, text) from public;
revoke all on function public.mark_portal_thread_read(uuid) from public;
revoke all on function public.get_portal_unread_message_count() from public;
revoke all on function public.portal_thread_summaries() from public;
revoke all on function public.create_portal_close_period(uuid, text, date, date, text) from public;
revoke all on function public.update_portal_close_period(uuid, public.close_status, text) from public;

grant execute on function public.create_portal_thread(uuid, text, text) to authenticated;
grant execute on function public.send_portal_message(uuid, text) to authenticated;
grant execute on function public.mark_portal_thread_read(uuid) to authenticated;
grant execute on function public.get_portal_unread_message_count() to authenticated;
grant execute on function public.portal_thread_summaries() to authenticated;
grant execute on function public.create_portal_close_period(uuid, text, date, date, text) to authenticated;
grant execute on function public.update_portal_close_period(uuid, public.close_status, text) to authenticated;

commit;
