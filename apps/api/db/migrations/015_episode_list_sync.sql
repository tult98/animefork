create table if not exists episode_list_sync (
  mal_id integer primary key,
  status text not null check (status in ('ok', 'failed')),
  airing text,
  attempted_at timestamptz not null
);
