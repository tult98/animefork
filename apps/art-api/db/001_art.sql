create table if not exists title_art (
  source_slug text primary key,
  status text not null check (status in ('matched', 'no_match', 'failed')),
  tmdb_id integer,
  tmdb_season integer,
  backdrop_path text,
  backdrop_lang text,
  reason text,
  matcher_version integer not null,
  attempted_at timestamptz not null default now(),
  constraint title_art_matched_has_tmdb check (
    status <> 'matched' or (tmdb_id is not null and tmdb_season is not null)
  )
);

create table if not exists episode_art (
  source_slug text not null references title_art (source_slug) on delete cascade,
  episode_number integer not null check (episode_number > 0),
  still_path text not null,
  primary key (source_slug, episode_number)
);
