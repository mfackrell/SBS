begin;

create extension if not exists pgcrypto;

create type public.org_role as enum ('owner', 'staff', 'client');
create type public.org_status as enum ('active', 'inactive');
create type public.membership_status as enum ('active', 'inactive');
create type public.lead_status as enum ('new', 'contacted', 'converted', 'not_fit');
create type public.proposal_status as enum ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired');
create type public.document_request_status as enum ('open', 'submitted', 'closed');
create type public.document_category as enum ('client_upload', 'staff_deliverable', 'other');
create type public.document_access_action as enum ('view', 'download', 'upload', 'delete');
create type public.close_status as enum ('pending_records', 'in_progress', 'in_review', 'delivered');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status public.org_status not null default 'active',
  primary_contact_id uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.org_role not null,
  invited_by uuid references auth.users(id) on delete set null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  status public.lead_status not null default 'new',
  name text not null,
  email text not null,
  phone text,
  company text not null,
  website text,
  revenue_range text,
  business_type text,
  accounting_software text,
  monthly_transactions_range text,
  entities_count integer check (entities_count is null or entities_count > 0),
  channels text[] not null default '{}',
  current_books_state text,
  start_timeline text,
  consent boolean not null default false,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  landing_page text,
  referrer text,
  routing_outcome text,
  suggested_tier text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  status public.proposal_status not null default 'draft',
  title text not null,
  currency char(3) not null default 'USD',
  subtotal_cents integer check (subtotal_cents is null or subtotal_cents >= 0),
  terms_text text not null default '',
  expires_at timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.proposal_line_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  position integer not null check (position >= 0),
  label text not null,
  description text,
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  amount_cents integer not null check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  unique (proposal_id, position)
);

create table public.proposal_acceptances (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null unique references public.proposals(id) on delete cascade,
  accepted_by uuid not null references auth.users(id) on delete restrict,
  accepted_name text not null,
  accepted_email text not null,
  accepted_at timestamptz not null default now(),
  ip_address inet,
  user_agent text,
  acceptance_text_snapshot text not null,
  created_at timestamptz not null default now()
);

create table public.document_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  status public.document_request_status not null default 'open',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid references public.document_requests(id) on delete set null,
  category public.document_category not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  revision integer not null default 1 check (revision > 0),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.document_access_logs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action public.document_access_action not null,
  at timestamptz not null default now()
);

create table public.threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.thread_participants (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (thread_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete restrict,
  body text not null,
  attachments jsonb,
  created_at timestamptz not null default now()
);

create table public.message_reads (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  unique (message_id, user_id)
);

create table public.close_periods (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  period_label text not null,
  period_start date not null,
  period_end date not null,
  status public.close_status not null default 'pending_records',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (org_id, period_start, period_end)
);

create table public.billing_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.organizations(id) on delete cascade,
  qbo_customer_ref text,
  qbo_portal_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index organization_memberships_user_idx on public.organization_memberships(user_id, status);
create index organization_memberships_org_idx on public.organization_memberships(org_id, status);
create index invites_org_idx on public.invites(org_id, created_at desc);
create index invites_email_idx on public.invites(lower(email));
create index leads_status_created_idx on public.leads(status, created_at desc);
create index leads_email_idx on public.leads(lower(email));
create index lead_events_lead_created_idx on public.lead_events(lead_id, created_at desc);
create index proposals_org_status_idx on public.proposals(org_id, status, created_at desc);
create index proposals_lead_idx on public.proposals(lead_id);
create index proposal_line_items_proposal_idx on public.proposal_line_items(proposal_id, position);
create index document_requests_org_status_idx on public.document_requests(org_id, status, created_at desc);
create index documents_org_created_idx on public.documents(org_id, created_at desc);
create index documents_request_idx on public.documents(request_id);
create index document_access_logs_document_idx on public.document_access_logs(document_id, at desc);
create index threads_org_created_idx on public.threads(org_id, created_at desc);
create index thread_participants_user_idx on public.thread_participants(user_id, thread_id);
create index messages_thread_created_idx on public.messages(thread_id, created_at);
create index message_reads_user_idx on public.message_reads(user_id, read_at);
create index close_periods_org_status_idx on public.close_periods(org_id, status, period_start desc);
create index audit_logs_org_created_idx on public.audit_logs(org_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger organizations_set_updated_at before update on public.organizations
for each row execute function public.set_updated_at();
create trigger organization_memberships_set_updated_at before update on public.organization_memberships
for each row execute function public.set_updated_at();
create trigger invites_set_updated_at before update on public.invites
for each row execute function public.set_updated_at();
create trigger leads_set_updated_at before update on public.leads
for each row execute function public.set_updated_at();
create trigger proposals_set_updated_at before update on public.proposals
for each row execute function public.set_updated_at();
create trigger document_requests_set_updated_at before update on public.document_requests
for each row execute function public.set_updated_at();
create trigger threads_set_updated_at before update on public.threads
for each row execute function public.set_updated_at();
create trigger close_periods_set_updated_at before update on public.close_periods
for each row execute function public.set_updated_at();
create trigger billing_profiles_set_updated_at before update on public.billing_profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.auth_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create or replace function public.is_org_member(target_org_id uuid)
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
  );
$$;

create or replace function public.org_role(target_org_id uuid)
returns public.org_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.organization_memberships m
  where m.org_id = target_org_id
    and m.user_id = auth.uid()
    and m.status = 'active'
  limit 1;
$$;

create or replace function public.can_manage_org(target_org_id uuid)
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
      and m.role in ('owner', 'staff')
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.org_role(uuid) from public;
revoke all on function public.can_manage_org(uuid) from public;
grant execute on function public.auth_user_id() to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.org_role(uuid) to authenticated;
grant execute on function public.can_manage_org(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.invites enable row level security;
alter table public.leads enable row level security;
alter table public.lead_events enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_line_items enable row level security;
alter table public.proposal_acceptances enable row level security;
alter table public.document_requests enable row level security;
alter table public.documents enable row level security;
alter table public.document_access_logs enable row level security;
alter table public.threads enable row level security;
alter table public.thread_participants enable row level security;
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;
alter table public.close_periods enable row level security;
alter table public.billing_profiles enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select_self on public.profiles
for select to authenticated
using (user_id = public.auth_user_id());

create policy profiles_update_self on public.profiles
for update to authenticated
using (user_id = public.auth_user_id())
with check (user_id = public.auth_user_id());

create policy organizations_select_member on public.organizations
for select to authenticated
using (public.is_org_member(id));

create policy organizations_update_manager on public.organizations
for update to authenticated
using (public.can_manage_org(id))
with check (public.can_manage_org(id));

create policy memberships_select_self_or_manager on public.organization_memberships
for select to authenticated
using (user_id = public.auth_user_id() or public.can_manage_org(org_id));

create policy memberships_insert_manager on public.organization_memberships
for insert to authenticated
with check (public.can_manage_org(org_id));

create policy memberships_update_manager on public.organization_memberships
for update to authenticated
using (public.can_manage_org(org_id))
with check (public.can_manage_org(org_id));

create policy memberships_delete_manager on public.organization_memberships
for delete to authenticated
using (public.can_manage_org(org_id));

create policy invites_select_manager on public.invites
for select to authenticated
using (public.can_manage_org(org_id));

create policy invites_insert_manager on public.invites
for insert to authenticated
with check (public.can_manage_org(org_id));

create policy invites_update_manager on public.invites
for update to authenticated
using (public.can_manage_org(org_id))
with check (public.can_manage_org(org_id));

create policy invites_delete_manager on public.invites
for delete to authenticated
using (public.can_manage_org(org_id));

create policy proposals_select_member on public.proposals
for select to authenticated
using (public.is_org_member(org_id));

create policy proposals_manage_staff on public.proposals
for all to authenticated
using (public.can_manage_org(org_id))
with check (public.can_manage_org(org_id));

create policy proposal_line_items_select_member on public.proposal_line_items
for select to authenticated
using (
  exists (
    select 1 from public.proposals p
    where p.id = proposal_id
      and public.is_org_member(p.org_id)
  )
);

create policy proposal_line_items_manage_staff on public.proposal_line_items
for all to authenticated
using (
  exists (
    select 1 from public.proposals p
    where p.id = proposal_id
      and public.can_manage_org(p.org_id)
  )
)
with check (
  exists (
    select 1 from public.proposals p
    where p.id = proposal_id
      and public.can_manage_org(p.org_id)
  )
);

create policy proposal_acceptances_select_member on public.proposal_acceptances
for select to authenticated
using (
  exists (
    select 1 from public.proposals p
    where p.id = proposal_id
      and public.is_org_member(p.org_id)
  )
);

create policy document_requests_select_member on public.document_requests
for select to authenticated
using (public.is_org_member(org_id));

create policy document_requests_manage_staff on public.document_requests
for all to authenticated
using (public.can_manage_org(org_id))
with check (public.can_manage_org(org_id));

create policy documents_select_member on public.documents
for select to authenticated
using (public.is_org_member(org_id));

create policy documents_manage_staff on public.documents
for all to authenticated
using (public.can_manage_org(org_id))
with check (public.can_manage_org(org_id));

create policy document_access_logs_select_staff on public.document_access_logs
for select to authenticated
using (
  exists (
    select 1 from public.documents d
    where d.id = document_id
      and public.can_manage_org(d.org_id)
  )
);

create policy threads_select_member on public.threads
for select to authenticated
using (public.is_org_member(org_id));

create policy threads_manage_staff on public.threads
for all to authenticated
using (public.can_manage_org(org_id))
with check (public.can_manage_org(org_id));

create policy thread_participants_select_member on public.thread_participants
for select to authenticated
using (
  exists (
    select 1 from public.threads t
    where t.id = thread_id
      and public.is_org_member(t.org_id)
  )
);

create policy messages_select_member on public.messages
for select to authenticated
using (
  exists (
    select 1 from public.threads t
    where t.id = thread_id
      and public.is_org_member(t.org_id)
  )
);

create policy message_reads_select_self on public.message_reads
for select to authenticated
using (user_id = public.auth_user_id());

create policy close_periods_select_member on public.close_periods
for select to authenticated
using (public.is_org_member(org_id));

create policy close_periods_manage_staff on public.close_periods
for all to authenticated
using (public.can_manage_org(org_id))
with check (public.can_manage_org(org_id));

create policy billing_profiles_select_member on public.billing_profiles
for select to authenticated
using (public.is_org_member(org_id));

create policy billing_profiles_manage_staff on public.billing_profiles
for all to authenticated
using (public.can_manage_org(org_id))
with check (public.can_manage_org(org_id));

create policy audit_logs_select_staff on public.audit_logs
for select to authenticated
using (org_id is not null and public.can_manage_org(org_id));

commit;
