create table if not exists episode_tmdb_sync (
  source_slug text primary key references title_art (source_slug) on delete cascade,
  status text not null check (status in ('ok', 'none', 'failed')),
  attempted_at timestamptz not null default now()
);
