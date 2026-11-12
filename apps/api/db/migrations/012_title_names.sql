create table if not exists title_names (
  source_slug text primary key,
  names text[] not null,
  updated_at timestamptz not null default now()
);
