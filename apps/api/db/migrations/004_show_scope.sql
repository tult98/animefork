alter table title_art add column if not exists match_scope text not null default 'season'
  check (match_scope in ('season', 'show'));
alter table title_art alter column tmdb_season drop not null;
alter table title_art drop constraint if exists title_art_matched_has_tmdb;
alter table title_art add constraint title_art_matched_has_tmdb check (
  status <> 'matched'
  or (tmdb_id is not null and (match_scope = 'show' or tmdb_season is not null))
);
