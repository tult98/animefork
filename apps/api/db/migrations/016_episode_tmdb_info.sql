create table if not exists episode_tmdb_info (
  source_slug text not null references title_art (source_slug) on delete cascade,
  episode_number integer not null check (episode_number > 0),
  name text,
  overview text,
  overview_lang text check (overview_lang in ('vi', 'en')),
  overview_vi text,
  primary key (source_slug, episode_number),
  constraint episode_tmdb_info_overview_lang check (
    overview is null or overview_lang is not null
  )
);
