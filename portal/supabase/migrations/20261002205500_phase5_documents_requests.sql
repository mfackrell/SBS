begin;

alter table public.documents
  add column if not exists document_series_id uuid,
  add column if not exists supersedes_document_id uuid references public.documents(id) on delete restrict,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

update public.documents
set document_series_id = id
where document_series_id is null;

alter table public.documents
  alter column document_series_id set not null;

create unique index if not exists documents_series_revision_unique
on public.documents (document_series_id, revision);

create index if not exists documents_series_created_idx
on public.documents (document_series_id, created_at desc);

create index if not exists documents_org_active_created_idx
on public.documents (org_id, created_at desc)
where deleted_at is null;

create table public.document_upload_intents (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique,
  org_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid references public.document_requests(id) on delete set null,
  category public.document_category not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  replaces_document_id uuid references public.documents(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index document_upload_intents_user_expiry_idx
on public.document_upload_intents (created_by, expires_at desc);

create index document_upload_intents_org_created_idx
on public.document_upload_intents (org_id, created_at desc);

alter table public.document_upload_intents enable row level security;

drop policy if exists document_requests_select_member on public.document_requests;
drop policy if exists document_requests_manage_staff on public.document_requests;
drop policy if exists documents_select_member on public.documents;
drop policy if exists documents_manage_staff on public.documents;

create policy document_requests_select_member on public.document_requests
for select to authenticated
using (public.is_org_member(org_id));

create policy documents_select_active_member on public.documents
for select to authenticated
using (
  deleted_at is null
  and public.is_org_member(org_id)
);

create policy document_upload_intents_select_creator_or_staff on public.document_upload_intents
for select to authenticated
using (
  created_by = auth.uid()
  or public.can_manage_org(org_id)
);

create or replace function public.document_path_org_id(object_name text)
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  parts text[];
  candidate text;
begin
  parts := storage.foldername(object_name);

  if coalesce(array_length(parts, 1), 0) < 4 then
    return null;
  end if;

  if parts[1] <> 'org' or parts[3] <> 'documents' then
    return null;
  end if;

  candidate := parts[2];

  if candidate !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;

  return candidate::uuid;
exception when others then
  return null;
end;
$$;

revoke all on function public.document_path_org_id(text) from public;
grant execute on function public.document_path_org_id(text) to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'private-documents',
  'private-documents',
  false,
  26214400,
  array[
    'application/pdf',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "private_documents_member_insert" on storage.objects;

create policy "private_documents_member_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'private-documents'
  and public.document_path_org_id(name) is not null
  and public.is_org_member(public.document_path_org_id(name))
  and lower(name) !~ '\\.(exe|dll|js|mjs|cjs|sh|bash|bat|cmd|com|scr|msi|ps1|vbs|jar|php|py|rb)$'
  and exists (
    select 1
    from public.document_upload_intents i
    where i.storage_path = name
      and i.created_by = auth.uid()
      and i.completed_at is null
      and i.expires_at > now()
  )
);

create or replace function public.create_portal_document_request(
  p_org_id uuid,
  p_title text,
  p_description text,
  p_due_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  new_request_id uuid;
begin
  if actor_id is null or not public.can_manage_org(p_org_id) then
    raise exception 'manager_required' using errcode = '42501';
  end if;

  if nullif(btrim(p_title), '') is null then
    raise exception 'request_title_required' using errcode = '22023';
  end if;

  insert into public.document_requests (
    org_id,
    title,
    description,
    due_date,
    status,
    created_by
  )
  values (
    p_org_id,
    btrim(p_title),
    nullif(btrim(coalesce(p_description, '')), ''),
    p_due_date,
    'open',
    actor_id
  )
  returning id into new_request_id;

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
    'document_request.created',
    'document_request',
    new_request_id,
    jsonb_build_object('due_date', p_due_date)
  );

  return new_request_id;
end;
$$;

create or replace function public.update_portal_document_request_status(
  p_request_id uuid,
  p_status public.document_request_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_request public.document_requests%rowtype;
begin
  select *
  into target_request
  from public.document_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'document_request_not_found' using errcode = 'P0002';
  end if;

  if actor_id is null or not public.can_manage_org(target_request.org_id) then
    raise exception 'manager_required' using errcode = '42501';
  end if;

  update public.document_requests
  set status = p_status
  where id = p_request_id;

  insert into public.audit_logs (
    org_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_request.org_id,
    actor_id,
    'document_request.status_changed',
    'document_request',
    target_request.id,
    jsonb_build_object(
      'old_status', target_request.status,
      'new_status', p_status
    )
  );
end;
$$;

create or replace function public.create_document_upload_intent(
  p_org_id uuid,
  p_request_id uuid,
  p_category public.document_category,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_replaces_document_id uuid,
  p_max_size_bytes bigint
)
returns table (
  intent_id uuid,
  document_id uuid,
  storage_path text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.org_role;
  new_intent_id uuid := gen_random_uuid();
  new_document_id uuid := gen_random_uuid();
  clean_file_name text;
  expires_value timestamptz := now() + interval '15 minutes';
  replaced_document public.documents%rowtype;
  allowed_mime_types constant text[] := array[
    'application/pdf',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg'
  ];
begin
  actor_role := public.org_role(p_org_id);

  if actor_id is null or actor_role is null then
    raise exception 'organization_membership_required' using errcode = '42501';
  end if;

  if p_category = 'staff_deliverable' and actor_role not in ('owner', 'staff') then
    raise exception 'staff_required_for_deliverable' using errcode = '42501';
  end if;

  if p_category = 'other' and actor_role not in ('owner', 'staff') then
    raise exception 'staff_required_for_other_document' using errcode = '42501';
  end if;

  if p_category = 'client_upload' and actor_role <> 'client' and actor_role not in ('owner', 'staff') then
    raise exception 'invalid_upload_role' using errcode = '42501';
  end if;

  if p_mime_type <> all(allowed_mime_types) then
    raise exception 'mime_type_not_allowed' using errcode = '22023';
  end if;

  if p_size_bytes <= 0 or p_size_bytes > p_max_size_bytes or p_size_bytes > 26214400 then
    raise exception 'file_size_not_allowed' using errcode = '22023';
  end if;

  clean_file_name := regexp_replace(btrim(p_file_name), '[^A-Za-z0-9._ -]+', '_', 'g');
  clean_file_name := regexp_replace(clean_file_name, '[[:space:]]+', '_', 'g');

  if clean_file_name = '' or clean_file_name in ('.', '..') or length(clean_file_name) > 180 then
    raise exception 'invalid_file_name' using errcode = '22023';
  end if;

  if lower(clean_file_name) ~ '\.(exe|dll|js|mjs|cjs|sh|bash|bat|cmd|com|scr|msi|ps1|vbs|jar|php|py|rb)$' then
    raise exception 'executable_file_blocked' using errcode = '22023';
  end if;

  if p_request_id is not null and not exists (
    select 1
    from public.document_requests r
    where r.id = p_request_id
      and r.org_id = p_org_id
      and r.status <> 'closed'
  ) then
    raise exception 'invalid_document_request' using errcode = '22023';
  end if;

  if p_replaces_document_id is not null then
    select *
    into replaced_document
    from public.documents d
    where d.id = p_replaces_document_id
      and d.deleted_at is null;

    if not found
       or replaced_document.org_id <> p_org_id
       or replaced_document.category <> p_category
       or replaced_document.request_id is distinct from p_request_id then
      raise exception 'invalid_document_revision_target' using errcode = '22023';
    end if;

    if actor_role = 'client' and replaced_document.uploaded_by <> actor_id then
      raise exception 'client_can_only_replace_own_upload' using errcode = '42501';
    end if;
  end if;

  insert into public.document_upload_intents (
    id,
    document_id,
    org_id,
    request_id,
    category,
    file_name,
    storage_path,
    mime_type,
    size_bytes,
    replaces_document_id,
    created_by,
    expires_at
  )
  values (
    new_intent_id,
    new_document_id,
    p_org_id,
    p_request_id,
    p_category,
    clean_file_name,
    'org/' || p_org_id::text || '/documents/' || new_document_id::text || '/' || clean_file_name,
    p_mime_type,
    p_size_bytes,
    p_replaces_document_id,
    actor_id,
    expires_value
  );

  return query
  select
    new_intent_id,
    new_document_id,
    'org/' || p_org_id::text || '/documents/' || new_document_id::text || '/' || clean_file_name,
    expires_value;
end;
$$;

create or replace function public.complete_document_upload_intent(p_intent_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_intent public.document_upload_intents%rowtype;
  replaced_document public.documents%rowtype;
  new_series_id uuid;
  new_revision integer := 1;
begin
  select *
  into target_intent
  from public.document_upload_intents
  where id = p_intent_id
  for update;

  if not found then
    raise exception 'upload_intent_not_found' using errcode = 'P0002';
  end if;

  if target_intent.completed_at is not null then
    return target_intent.document_id;
  end if;

  if target_intent.expires_at <= now() then
    raise exception 'upload_intent_expired' using errcode = '22023';
  end if;

  if actor_id is null
     or (
       target_intent.created_by <> actor_id
       and not public.can_manage_org(target_intent.org_id)
     ) then
    raise exception 'upload_intent_not_authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'private-documents'
      and o.name = target_intent.storage_path
  ) then
    raise exception 'storage_object_not_found' using errcode = 'P0002';
  end if;

  if target_intent.replaces_document_id is not null then
    select *
    into replaced_document
    from public.documents
    where id = target_intent.replaces_document_id
      and deleted_at is null
    for update;

    if not found then
      raise exception 'revision_target_not_found' using errcode = 'P0002';
    end if;

    new_series_id := replaced_document.document_series_id;

    select coalesce(max(d.revision), 0) + 1
    into new_revision
    from public.documents d
    where d.document_series_id = new_series_id;
  else
    new_series_id := target_intent.document_id;
  end if;

  insert into public.documents (
    id,
    document_series_id,
    supersedes_document_id,
    org_id,
    request_id,
    category,
    file_name,
    storage_path,
    mime_type,
    size_bytes,
    revision,
    uploaded_by
  )
  values (
    target_intent.document_id,
    new_series_id,
    target_intent.replaces_document_id,
    target_intent.org_id,
    target_intent.request_id,
    target_intent.category,
    target_intent.file_name,
    target_intent.storage_path,
    target_intent.mime_type,
    target_intent.size_bytes,
    new_revision,
    target_intent.created_by
  );

  update public.document_upload_intents
  set completed_at = now()
  where id = p_intent_id;

  if target_intent.request_id is not null and target_intent.category = 'client_upload' then
    update public.document_requests
    set status = 'submitted'
    where id = target_intent.request_id
      and status = 'open';
  end if;

  insert into public.document_access_logs (
    document_id,
    user_id,
    action,
    at
  )
  values (
    target_intent.document_id,
    target_intent.created_by,
    'upload',
    now()
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
    target_intent.org_id,
    actor_id,
    'document.uploaded',
    'document',
    target_intent.document_id,
    jsonb_build_object(
      'category', target_intent.category,
      'request_id', target_intent.request_id,
      'revision', new_revision,
      'supersedes_document_id', target_intent.replaces_document_id,
      'mime_type', target_intent.mime_type,
      'size_bytes', target_intent.size_bytes,
      'virus_scan_status', 'pending_hook'
    )
  );

  return target_intent.document_id;
end;
$$;

create or replace function public.log_document_download(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_document public.documents%rowtype;
begin
  select *
  into target_document
  from public.documents
  where id = p_document_id
    and deleted_at is null;

  if not found then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;

  if actor_id is null or not public.is_org_member(target_document.org_id) then
    raise exception 'organization_membership_required' using errcode = '42501';
  end if;

  insert into public.document_access_logs (
    document_id,
    user_id,
    action,
    at
  )
  values (
    p_document_id,
    actor_id,
    'download',
    now()
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
    target_document.org_id,
    actor_id,
    'document.downloaded',
    'document',
    p_document_id,
    jsonb_build_object('revision', target_document.revision)
  );
end;
$$;

create or replace function public.soft_delete_portal_document(p_document_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_document public.documents%rowtype;
begin
  select *
  into target_document
  from public.documents
  where id = p_document_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;

  if actor_id is null or not public.can_manage_org(target_document.org_id) then
    raise exception 'manager_required' using errcode = '42501';
  end if;

  update public.documents
  set
    deleted_at = now(),
    deleted_by = actor_id
  where id = p_document_id;

  insert into public.document_access_logs (
    document_id,
    user_id,
    action,
    at
  )
  values (
    p_document_id,
    actor_id,
    'delete',
    now()
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
    target_document.org_id,
    actor_id,
    'document.deleted',
    'document',
    p_document_id,
    jsonb_build_object(
      'storage_path', target_document.storage_path,
      'revision', target_document.revision
    )
  );

  return target_document.storage_path;
end;
$$;

revoke all on function public.create_portal_document_request(uuid, text, text, date) from public;
revoke all on function public.update_portal_document_request_status(uuid, public.document_request_status) from public;
revoke all on function public.create_document_upload_intent(uuid, uuid, public.document_category, text, text, bigint, uuid, bigint) from public;
revoke all on function public.complete_document_upload_intent(uuid) from public;
revoke all on function public.log_document_download(uuid) from public;
revoke all on function public.soft_delete_portal_document(uuid) from public;

grant execute on function public.create_portal_document_request(uuid, text, text, date) to authenticated;
grant execute on function public.update_portal_document_request_status(uuid, public.document_request_status) to authenticated;
grant execute on function public.create_document_upload_intent(uuid, uuid, public.document_category, text, text, bigint, uuid, bigint) to authenticated;
grant execute on function public.complete_document_upload_intent(uuid) to authenticated;
grant execute on function public.log_document_download(uuid) to authenticated;
grant execute on function public.soft_delete_portal_document(uuid) to authenticated;

commit;

  and exists (
    select 1
    from public.document_upload_intents i
    where i.storage_path = name
      and i.created_by = auth.uid()
      and i.completed_at is null
      and i.expires_at > now()
  )
);

create or replace function public.create_portal_document_request(
  p_org_id uuid,
  p_title text,
  p_description text,
  p_due_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  new_request_id uuid;
begin
  if actor_id is null or not public.can_manage_org(p_org_id) then
    raise exception 'manager_required' using errcode = '42501';
  end if;

  if nullif(btrim(p_title), '') is null then
    raise exception 'request_title_required' using errcode = '22023';
  end if;

  insert into public.document_requests (
    org_id,
    title,
    description,
    due_date,
    status,
    created_by
  )
  values (
    p_org_id,
    btrim(p_title),
    nullif(btrim(coalesce(p_description, '')), ''),
    p_due_date,
    'open',
    actor_id
  )
  returning id into new_request_id;

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
    'document_request.created',
    'document_request',
    new_request_id,
    jsonb_build_object('due_date', p_due_date)
  );

  return new_request_id;
end;
$$;

create or replace function public.update_portal_document_request_status(
  p_request_id uuid,
  p_status public.document_request_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_request public.document_requests%rowtype;
begin
  select *
  into target_request
  from public.document_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'document_request_not_found' using errcode = 'P0002';
  end if;

  if actor_id is null or not public.can_manage_org(target_request.org_id) then
    raise exception 'manager_required' using errcode = '42501';
  end if;

  update public.document_requests
  set status = p_status
  where id = p_request_id;

  insert into public.audit_logs (
    org_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_request.org_id,
    actor_id,
    'document_request.status_changed',
    'document_request',
    target_request.id,
    jsonb_build_object(
      'old_status', target_request.status,
      'new_status', p_status
    )
  );
end;
$$;

create or replace function public.create_document_upload_intent(
  p_org_id uuid,
  p_request_id uuid,
  p_category public.document_category,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_replaces_document_id uuid,
  p_max_size_bytes bigint
)
returns table (
  intent_id uuid,
  document_id uuid,
  storage_path text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.org_role;
  new_intent_id uuid := gen_random_uuid();
  new_document_id uuid := gen_random_uuid();
  clean_file_name text;
  expires_value timestamptz := now() + interval '15 minutes';
  replaced_document public.documents%rowtype;
  allowed_mime_types constant text[] := array[
    'application/pdf',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg'
  ];
begin
  actor_role := public.org_role(p_org_id);

  if actor_id is null or actor_role is null then
    raise exception 'organization_membership_required' using errcode = '42501';
  end if;

  if p_category = 'staff_deliverable' and actor_role not in ('owner', 'staff') then
    raise exception 'staff_required_for_deliverable' using errcode = '42501';
  end if;

  if p_category = 'other' and actor_role not in ('owner', 'staff') then
    raise exception 'staff_required_for_other_document' using errcode = '42501';
  end if;

  if p_category = 'client_upload' and actor_role <> 'client' and actor_role not in ('owner', 'staff') then
    raise exception 'invalid_upload_role' using errcode = '42501';
  end if;

  if p_mime_type <> all(allowed_mime_types) then
    raise exception 'mime_type_not_allowed' using errcode = '22023';
  end if;

  if p_size_bytes <= 0 or p_size_bytes > p_max_size_bytes or p_size_bytes > 26214400 then
    raise exception 'file_size_not_allowed' using errcode = '22023';
  end if;

  clean_file_name := regexp_replace(btrim(p_file_name), '[^A-Za-z0-9._ -]+', '_', 'g');
  clean_file_name := regexp_replace(clean_file_name, '[[:space:]]+', '_', 'g');

  if clean_file_name = '' or clean_file_name in ('.', '..') or length(clean_file_name) > 180 then
    raise exception 'invalid_file_name' using errcode = '22023';
  end if;

  if lower(clean_file_name) ~ '\.(exe|dll|js|mjs|cjs|sh|bash|bat|cmd|com|scr|msi|ps1|vbs|jar|php|py|rb)$' then
    raise exception 'executable_file_blocked' using errcode = '22023';
  end if;

  if p_request_id is not null and not exists (
    select 1
    from public.document_requests r
    where r.id = p_request_id
      and r.org_id = p_org_id
      and r.status <> 'closed'
  ) then
    raise exception 'invalid_document_request' using errcode = '22023';
  end if;

  if p_replaces_document_id is not null then
    select *
    into replaced_document
    from public.documents d
    where d.id = p_replaces_document_id
      and d.deleted_at is null;

    if not found
       or replaced_document.org_id <> p_org_id
       or replaced_document.category <> p_category
       or replaced_document.request_id is distinct from p_request_id then
      raise exception 'invalid_document_revision_target' using errcode = '22023';
    end if;

    if actor_role = 'client' and replaced_document.uploaded_by <> actor_id then
      raise exception 'client_can_only_replace_own_upload' using errcode = '42501';
    end if;
  end if;

  insert into public.document_upload_intents (
    id,
    document_id,
    org_id,
    request_id,
    category,
    file_name,
    storage_path,
    mime_type,
    size_bytes,
    replaces_document_id,
    created_by,
    expires_at
  )
  values (
    new_intent_id,
    new_document_id,
    p_org_id,
    p_request_id,
    p_category,
    clean_file_name,
    'org/' || p_org_id::text || '/documents/' || new_document_id::text || '/' || clean_file_name,
    p_mime_type,
    p_size_bytes,
    p_replaces_document_id,
    actor_id,
    expires_value
  );

  return query
  select
    new_intent_id,
    new_document_id,
    'org/' || p_org_id::text || '/documents/' || new_document_id::text || '/' || clean_file_name,
    expires_value;
end;
$$;

create or replace function public.complete_document_upload_intent(p_intent_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_intent public.document_upload_intents%rowtype;
  replaced_document public.documents%rowtype;
  new_series_id uuid;
  new_revision integer := 1;
begin
  select *
  into target_intent
  from public.document_upload_intents
  where id = p_intent_id
  for update;

  if not found then
    raise exception 'upload_intent_not_found' using errcode = 'P0002';
  end if;

  if target_intent.completed_at is not null then
    return target_intent.document_id;
  end if;

  if target_intent.expires_at <= now() then
    raise exception 'upload_intent_expired' using errcode = '22023';
  end if;

  if actor_id is null
     or (
       target_intent.created_by <> actor_id
       and not public.can_manage_org(target_intent.org_id)
     ) then
    raise exception 'upload_intent_not_authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'private-documents'
      and o.name = target_intent.storage_path
  ) then
    raise exception 'storage_object_not_found' using errcode = 'P0002';
  end if;

  if target_intent.replaces_document_id is not null then
    select *
    into replaced_document
    from public.documents
    where id = target_intent.replaces_document_id
      and deleted_at is null
    for update;

    if not found then
      raise exception 'revision_target_not_found' using errcode = 'P0002';
    end if;

    new_series_id := replaced_document.document_series_id;

    select coalesce(max(d.revision), 0) + 1
    into new_revision
    from public.documents d
    where d.document_series_id = new_series_id;
  else
    new_series_id := target_intent.document_id;
  end if;

  insert into public.documents (
    id,
    document_series_id,
    supersedes_document_id,
    org_id,
    request_id,
    category,
    file_name,
    storage_path,
    mime_type,
    size_bytes,
    revision,
    uploaded_by
  )
  values (
    target_intent.document_id,
    new_series_id,
    target_intent.replaces_document_id,
    target_intent.org_id,
    target_intent.request_id,
    target_intent.category,
    target_intent.file_name,
    target_intent.storage_path,
    target_intent.mime_type,
    target_intent.size_bytes,
    new_revision,
    target_intent.created_by
  );

  update public.document_upload_intents
  set completed_at = now()
  where id = p_intent_id;

  if target_intent.request_id is not null and target_intent.category = 'client_upload' then
    update public.document_requests
    set status = 'submitted'
    where id = target_intent.request_id
      and status = 'open';
  end if;

  insert into public.document_access_logs (
    document_id,
    user_id,
    action,
    at
  )
  values (
    target_intent.document_id,
    target_intent.created_by,
    'upload',
    now()
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
    target_intent.org_id,
    actor_id,
    'document.uploaded',
    'document',
    target_intent.document_id,
    jsonb_build_object(
      'category', target_intent.category,
      'request_id', target_intent.request_id,
      'revision', new_revision,
      'supersedes_document_id', target_intent.replaces_document_id,
      'mime_type', target_intent.mime_type,
      'size_bytes', target_intent.size_bytes,
      'virus_scan_status', 'pending_hook'
    )
  );

  return target_intent.document_id;
end;
$$;

create or replace function public.log_document_download(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_document public.documents%rowtype;
begin
  select *
  into target_document
  from public.documents
  where id = p_document_id
    and deleted_at is null;

  if not found then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;

  if actor_id is null or not public.is_org_member(target_document.org_id) then
    raise exception 'organization_membership_required' using errcode = '42501';
  end if;

  insert into public.document_access_logs (
    document_id,
    user_id,
    action,
    at
  )
  values (
    p_document_id,
    actor_id,
    'download',
    now()
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
    target_document.org_id,
    actor_id,
    'document.downloaded',
    'document',
    p_document_id,
    jsonb_build_object('revision', target_document.revision)
  );
end;
$$;

create or replace function public.soft_delete_portal_document(p_document_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_document public.documents%rowtype;
begin
  select *
  into target_document
  from public.documents
  where id = p_document_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;

  if actor_id is null or not public.can_manage_org(target_document.org_id) then
    raise exception 'manager_required' using errcode = '42501';
  end if;

  update public.documents
  set
    deleted_at = now(),
    deleted_by = actor_id
  where id = p_document_id;

  insert into public.document_access_logs (
    document_id,
    user_id,
    action,
    at
  )
  values (
    p_document_id,
    actor_id,
    'delete',
    now()
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
    target_document.org_id,
    actor_id,
    'document.deleted',
    'document',
    p_document_id,
    jsonb_build_object(
      'storage_path', target_document.storage_path,
      'revision', target_document.revision
    )
  );

  return target_document.storage_path;
end;
$$;

revoke all on function public.create_portal_document_request(uuid, text, text, date) from public;
revoke all on function public.update_portal_document_request_status(uuid, public.document_request_status) from public;
revoke all on function public.create_document_upload_intent(uuid, uuid, public.document_category, text, text, bigint, uuid, bigint) from public;
revoke all on function public.complete_document_upload_intent(uuid) from public;
revoke all on function public.log_document_download(uuid) from public;
revoke all on function public.soft_delete_portal_document(uuid) from public;

grant execute on function public.create_portal_document_request(uuid, text, text, date) to authenticated;
grant execute on function public.update_portal_document_request_status(uuid, public.document_request_status) to authenticated;
grant execute on function public.create_document_upload_intent(uuid, uuid, public.document_category, text, text, bigint, uuid, bigint) to authenticated;
grant execute on function public.complete_document_upload_intent(uuid) to authenticated;
grant execute on function public.log_document_download(uuid) to authenticated;
grant execute on function public.soft_delete_portal_document(uuid) to authenticated;

commit;
