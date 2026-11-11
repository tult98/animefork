alter table title_mal
  add column if not exists mal_airing text
    check (mal_airing in ('currently_airing', 'finished_airing', 'not_yet_aired')),
  add column if not exists mal_episodes integer check (mal_episodes > 0);
