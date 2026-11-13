create table if not exists episode_info (
  mal_id integer not null,
  episode_number integer not null check (episode_number > 0),
  title text not null,
  title_alt text,
  title_vi text,
  synopsis text,
  synopsis_vi text,
  aired date,
  synopsis_fetched_at timestamptz,
  translated_at timestamptz,
  fetched_at timestamptz not null default now(),
  primary key (mal_id, episode_number)
);
