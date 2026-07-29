-- Add insider_data column to snapshots for insider transaction tracking.
alter table snapshots add column if not exists insider_data jsonb not null default '{}'::jsonb;
