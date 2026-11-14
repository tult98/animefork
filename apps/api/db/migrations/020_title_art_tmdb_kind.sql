alter table title_art add column if not exists tmdb_kind text not null default 'tv'
  check (tmdb_kind in ('tv', 'movie'));
