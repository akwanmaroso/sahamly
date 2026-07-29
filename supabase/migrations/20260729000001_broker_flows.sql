create table if not exists broker_flows (
  id uuid primary key default gen_random_uuid(),
  ticker_id uuid not null references tickers (id) on delete cascade,
  trade_date date not null,
  broker_code text not null,
  broker_type text not null check (broker_type in ('foreign', 'domestic')),
  buy_volume bigint not null default 0,
  buy_value bigint not null default 0,
  sell_volume bigint not null default 0,
  sell_value bigint not null default 0,
  net_value bigint generated always as (buy_value - sell_value) stored,
  created_at timestamptz not null default now(),
  unique (ticker_id, trade_date, broker_code)
);

create index if not exists broker_flows_ticker_date_idx on broker_flows (ticker_id, trade_date);

alter table broker_flows enable row level security;

create policy "Authenticated users can manage broker_flows"
  on broker_flows for all
  to authenticated
  using (true)
  with check (true);
