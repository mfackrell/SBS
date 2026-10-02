begin;

drop policy if exists billing_profiles_manage_staff on public.billing_profiles;

create or replace function public.update_portal_billing_profile(
  p_org_id uuid,
  p_qbo_customer_ref text,
  p_qbo_portal_url text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  clean_ref text := nullif(btrim(coalesce(p_qbo_customer_ref, '')), '');
  clean_url text := nullif(btrim(coalesce(p_qbo_portal_url, '')), '');
  clean_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  profile_id uuid;
begin
  if actor_id is null or not public.can_manage_org(p_org_id) then
    raise exception 'manager_required' using errcode = '42501';
  end if;

  if clean_ref is not null and length(clean_ref) > 255 then
    raise exception 'billing_reference_too_long' using errcode = '22023';
  end if;

  if clean_url is not null then
    if length(clean_url) > 2000 then
      raise exception 'billing_url_too_long' using errcode = '22023';
    end if;

    if clean_url !~* '^https://[^[:space:]]+$' then
      raise exception 'billing_url_must_be_https' using errcode = '22023';
    end if;
  end if;

  if clean_notes is not null and length(clean_notes) > 4000 then
    raise exception 'billing_notes_too_long' using errcode = '22023';
  end if;

  insert into public.billing_profiles (
    org_id,
    qbo_customer_ref,
    qbo_portal_url,
    notes
  )
  values (
    p_org_id,
    clean_ref,
    clean_url,
    clean_notes
  )
  on conflict (org_id)
  do update set
    qbo_customer_ref = excluded.qbo_customer_ref,
    qbo_portal_url = excluded.qbo_portal_url,
    notes = excluded.notes
  returning id into profile_id;

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
    'billing.profile_updated',
    'billing_profile',
    profile_id,
    jsonb_build_object(
      'has_customer_ref', clean_ref is not null,
      'has_portal_url', clean_url is not null,
      'has_notes', clean_notes is not null
    )
  );

  return profile_id;
end;
$$;

create or replace function public.portal_admin_ops_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not public.is_portal_staff() then
    raise exception 'staff_required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'organizations', jsonb_build_object(
      'active', (select count(*) from public.organizations where status = 'active'),
      'inactive', (select count(*) from public.organizations where status = 'inactive')
    ),
    'leads', jsonb_build_object(
      'new', (select count(*) from public.leads where status = 'new'),
      'contacted', (select count(*) from public.leads where status = 'contacted'),
      'converted', (select count(*) from public.leads where status = 'converted'),
      'not_fit', (select count(*) from public.leads where status = 'not_fit')
    ),
    'proposals', jsonb_build_object(
      'draft', (select count(*) from public.proposals where status = 'draft'),
      'sent', (select count(*) from public.proposals where status = 'sent'),
      'viewed', (select count(*) from public.proposals where status = 'viewed'),
      'accepted', (select count(*) from public.proposals where status = 'accepted'),
      'declined', (select count(*) from public.proposals where status = 'declined'),
      'expired', (select count(*) from public.proposals where status = 'expired')
    ),
    'document_requests', jsonb_build_object(
      'open', (select count(*) from public.document_requests where status = 'open'),
      'submitted', (select count(*) from public.document_requests where status = 'submitted'),
      'closed', (select count(*) from public.document_requests where status = 'closed')
    ),
    'close_periods', jsonb_build_object(
      'pending_records', (select count(*) from public.close_periods where status = 'pending_records'),
      'in_progress', (select count(*) from public.close_periods where status = 'in_progress'),
      'in_review', (select count(*) from public.close_periods where status = 'in_review'),
      'delivered', (select count(*) from public.close_periods where status = 'delivered')
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function public.update_portal_billing_profile(uuid, text, text, text) from public;
revoke all on function public.portal_admin_ops_summary() from public;

grant execute on function public.update_portal_billing_profile(uuid, text, text, text) to authenticated;
grant execute on function public.portal_admin_ops_summary() to authenticated;

commit;
