-- Stores daily OHLCV history per ticker for backtesting and multi-timeframe analysis.
-- Backfilled from yfinance (2 years), then kept up-to-date from IDX daily snapshots.

create table if not exists price_history (
  id uuid primary key default gen_random_uuid(),
  ticker_id uuid not null references tickers (id) on delete cascade,
  date date not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume bigint not null,
  source text not null default 'yfinance', -- 'yfinance' or 'idx'
  created_at timestamptz not null default now(),
  unique (ticker_id, date)
);

create index if not exists price_history_ticker_date_idx
  on price_history (ticker_id, date desc);

-- Stores backtesting results: what signal was generated, what happened after.
create table if not exists backtest_results (
  id uuid primary key default gen_random_uuid(),
  ticker_id uuid not null references tickers (id) on delete cascade,
  signal_date date not null,
  signal_type text not null, -- 'composite_score', 'verdict', 'divergence', etc.
  signal_value jsonb not null, -- the signal snapshot (score, verdict, etc.)
  forward_return_5d numeric,   -- % return after 5 trading days
  forward_return_10d numeric,  -- % return after 10 trading days
  forward_return_20d numeric,  -- % return after 20 trading days
  max_drawdown_20d numeric,    -- worst intraday drop in 20d window
  outcome text, -- 'win', 'loss', 'neutral' based on 10d return vs 0
  created_at timestamptz not null default now(),
  unique (ticker_id, signal_date, signal_type)
);

create index if not exists backtest_results_ticker_idx
  on backtest_results (ticker_id, signal_date desc);
create index if not exists backtest_results_signal_type_idx
  on backtest_results (signal_type, outcome);

alter table price_history enable row level security;
alter table backtest_results enable row level security;

create policy "Authenticated users can manage price_history"
  on price_history for all to authenticated
  using (true) with check (true);

create policy "Authenticated users can manage backtest_results"
  on backtest_results for all to authenticated
  using (true) with check (true);
