begin;

create table public.quickbooks_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.organizations(id) on delete cascade,
  realm_id text not null unique,
  company_name text,
  environment text not null check (environment in ('sandbox', 'production')),
  status text not null default 'active' check (status in ('active', 'error', 'disconnected')),
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  sync_requested_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quickbooks_credentials (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quickbooks_financial_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  as_of_date date not null,
  fiscal_ytd_start date not null,
  currency char(3) not null default 'USD',
  accounting_method text not null default 'Accrual' check (accounting_method in ('Accrual', 'Cash')),
  revenue_mtd numeric(18,2),
  gross_profit_mtd numeric(18,2),
  net_income_mtd numeric(18,2),
  revenue_ytd numeric(18,2),
  gross_profit_ytd numeric(18,2),
  operating_income_ytd numeric(18,2),
  net_income_ytd numeric(18,2),
  cash_balance numeric(18,2),
  total_assets numeric(18,2),
  total_liabilities numeric(18,2),
  accounts_receivable numeric(18,2),
  accounts_payable numeric(18,2),
  source_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (org_id, as_of_date)
);

create table public.quickbooks_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  realm_id text not null,
  event_type text not null,
  occurred_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index quickbooks_connections_sync_idx
  on public.quickbooks_connections(status, last_synced_at, sync_requested_at);
create index quickbooks_snapshots_org_date_idx
  on public.quickbooks_financial_snapshots(org_id, as_of_date desc);
create index quickbooks_webhooks_realm_idx
  on public.quickbooks_webhook_events(realm_id, received_at desc);

create trigger quickbooks_connections_set_updated_at
before update on public.quickbooks_connections
for each row execute function public.set_updated_at();

create trigger quickbooks_credentials_set_updated_at
before update on public.quickbooks_credentials
for each row execute function public.set_updated_at();

alter table public.quickbooks_connections enable row level security;
alter table public.quickbooks_credentials enable row level security;
alter table public.quickbooks_financial_snapshots enable row level security;
alter table public.quickbooks_webhook_events enable row level security;

create policy quickbooks_connections_select_member
on public.quickbooks_connections
for select to authenticated
using (public.is_org_member(org_id));

create policy quickbooks_snapshots_select_member
on public.quickbooks_financial_snapshots
for select to authenticated
using (public.is_org_member(org_id));

revoke all on table public.quickbooks_connections from anon, authenticated;
revoke all on table public.quickbooks_credentials from anon, authenticated;
revoke all on table public.quickbooks_financial_snapshots from anon, authenticated;
revoke all on table public.quickbooks_webhook_events from anon, authenticated;

grant select on table public.quickbooks_connections to authenticated;
grant select on table public.quickbooks_financial_snapshots to authenticated;
grant all on table public.quickbooks_connections to service_role;
grant all on table public.quickbooks_credentials to service_role;
grant all on table public.quickbooks_financial_snapshots to service_role;
grant all on table public.quickbooks_webhook_events to service_role;

commit;
