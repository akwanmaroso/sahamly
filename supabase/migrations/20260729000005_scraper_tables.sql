-- Tables for the standalone scraper service.
-- These store data scraped directly from IDX, replacing external API dependencies.

-- Foreign daily flow: per-ticker daily foreign buy/sell (replaces Index Alpha foreign-flow)
create table if not exists foreign_daily_flow (
  id uuid primary key default gen_random_uuid(),
  ticker_id uuid not null references tickers(id) on delete cascade,
  trade_date date not null,
  foreign_buy_volume bigint not null default 0,
  foreign_sell_volume bigint not null default 0,
  net_foreign_volume bigint generated always as (foreign_buy_volume - foreign_sell_volume) stored,
  net_foreign_value bigint not null default 0,
  close_price numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (ticker_id, trade_date)
);
create index if not exists idx_foreign_daily_flow_ticker_date on foreign_daily_flow (ticker_id, trade_date);

alter table foreign_daily_flow enable row level security;
create policy "Authenticated users can manage foreign_daily_flow"
  on foreign_daily_flow for all to authenticated
  using (true) with check (true);

-- Running trades: individual trade records for block trade detection
create table if not exists running_trades (
  id uuid primary key default gen_random_uuid(),
  ticker_id uuid not null references tickers(id) on delete cascade,
  trade_date date not null,
  trade_time text not null default '',
  price numeric not null default 0,
  volume bigint not null default 0,
  value bigint not null default 0,
  buyer_broker text not null default '',
  buyer_type text not null default 'domestic' check (buyer_type in ('foreign', 'domestic')),
  seller_broker text not null default '',
  seller_type text not null default 'domestic' check (seller_type in ('foreign', 'domestic')),
  is_block_trade boolean not null default false,
  created_at timestamptz not null default now(),
  unique (ticker_id, trade_date, trade_time, buyer_broker, seller_broker)
);
create index if not exists idx_running_trades_ticker_date on running_trades (ticker_id, trade_date);
create index if not exists idx_running_trades_block on running_trades (ticker_id, is_block_trade) where is_block_trade = true;

alter table running_trades enable row level security;
create policy "Authenticated users can manage running_trades"
  on running_trades for all to authenticated
  using (true) with check (true);

-- Ticker fundamentals: cached financial ratios (replaces Yahoo Finance)
create table if not exists ticker_fundamentals (
  id uuid primary key default gen_random_uuid(),
  ticker_id uuid not null references tickers(id) on delete cascade unique,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ticker_fundamentals enable row level security;
create policy "Authenticated users can manage ticker_fundamentals"
  on ticker_fundamentals for all to authenticated
  using (true) with check (true);

-- Ticker insider data: cached insider transactions and shareholders (replaces yfinance)
create table if not exists ticker_insider_data (
  id uuid primary key default gen_random_uuid(),
  ticker_id uuid not null references tickers(id) on delete cascade unique,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ticker_insider_data enable row level security;
create policy "Authenticated users can manage ticker_insider_data"
  on ticker_insider_data for all to authenticated
  using (true) with check (true);
