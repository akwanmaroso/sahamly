-- Add whale-specific signal types and priority column

-- Drop and recreate signal_type CHECK constraint with new values
alter table signals drop constraint if exists signals_signal_type_check;
alter table signals add constraint signals_signal_type_check check (signal_type in (
  'verdict_change',
  'flow_reversal',
  'unusual_volume',
  'score_spike',
  'consecutive_buy_streak',
  'mfi_extreme',
  'whale_accumulation',
  'whale_distribution',
  'block_trade',
  'smart_money_reversal'
));

-- Add priority column
alter table signals add column if not exists priority text
  not null default 'normal'
  check (priority in ('low', 'normal', 'high', 'urgent'));

-- Index for unread + priority sorting
create index if not exists idx_signals_priority on signals (priority, read, created_at desc);
