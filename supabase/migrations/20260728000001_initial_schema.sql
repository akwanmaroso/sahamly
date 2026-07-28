-- Personal single-user watchlist schema.
-- RLS is enabled on every table and scoped to "any authenticated user" since
-- this app has exactly one user; the service-role client (cron/API routes)
-- bypasses RLS entirely.

create table if not exists tickers (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique,
  name text not null,
  sector text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists snapshots (
  id uuid primary key default gen_random_uuid(),
  ticker_id uuid not null references tickers (id) on delete cascade,
  as_of_date date not null,
  price_data jsonb not null default '{}'::jsonb,
  fundamental_data jsonb not null default '{}'::jsonb,
  flow_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists snapshots_ticker_id_idx on snapshots (ticker_id);
create index if not exists snapshots_as_of_date_idx on snapshots (as_of_date);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  ticker_id uuid not null references tickers (id) on delete cascade,
  snapshot_id uuid not null references snapshots (id) on delete cascade,
  verdict text not null check (verdict in ('Accumulate', 'Hold', 'Avoid', 'Watch')),
  confidence text not null check (confidence in ('High', 'Medium', 'Low')),
  report_json jsonb not null,
  generated_at timestamptz not null default now()
);

create index if not exists reports_ticker_id_idx on reports (ticker_id);
create index if not exists reports_snapshot_id_idx on reports (snapshot_id);

alter table tickers enable row level security;
alter table snapshots enable row level security;
alter table reports enable row level security;

create policy "Authenticated users can manage tickers"
  on tickers for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can manage snapshots"
  on snapshots for all
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can manage reports"
  on reports for all
  to authenticated
  using (true)
  with check (true);
