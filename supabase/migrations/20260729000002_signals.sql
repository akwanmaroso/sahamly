-- Watchlist signals / alerts
create table signals (
  id uuid primary key default gen_random_uuid(),
  ticker_id uuid not null references tickers(id) on delete cascade,
  report_id uuid references reports(id) on delete set null,
  signal_type text not null check (signal_type in (
    'verdict_change',
    'flow_reversal',
    'unusual_volume',
    'score_spike',
    'consecutive_buy_streak',
    'mfi_extreme'
  )),
  severity text not null check (severity in ('info', 'warning', 'critical')) default 'info',
  title text not null,
  description text not null,
  data jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index on signals (ticker_id, created_at desc);
create index on signals (read, created_at desc);

-- RLS
alter table signals enable row level security;
create policy "Authenticated users can manage signals"
  on signals for all to authenticated
  using (true) with check (true);
