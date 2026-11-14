alter table title_mal
  add column if not exists mal_media_type text,
  add column if not exists mal_english text,
  add column if not exists mal_synonyms text[] not null default '{}';

alter table title_art drop constraint if exists title_art_matched_by_check;
alter table title_art
  add constraint title_art_matched_by_check
  check (matched_by in ('baseline', 'jev', 'mal'));

alter table title_art add column if not exists source_mal_id integer;
