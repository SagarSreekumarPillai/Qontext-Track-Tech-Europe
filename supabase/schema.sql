create table if not exists raw_records (
  id text primary key,
  source_type text not null check (source_type in ('crm', 'email', 'hr', 'ticket', 'policy')),
  source_id text not null,
  content text not null,
  timestamp timestamptz not null,
  ingested_at timestamptz not null default now()
);

create table if not exists update_history (
  id bigint generated always as identity primary key,
  entity_id text not null,
  fact_key text not null,
  action text not null check (action in ('auto_applied', 'queued', 'approved', 'rejected')),
  before_value text,
  after_value text,
  actor text not null check (actor in ('system', 'human')),
  created_at timestamptz not null default now()
);
