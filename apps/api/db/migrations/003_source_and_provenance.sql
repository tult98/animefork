alter table title_art add column if not exists source_name text;
alter table title_art add column if not exists source_year integer;
alter table title_art add column if not exists source_episode_count integer;
alter table title_art add column if not exists matched_by text
  check (matched_by in ('baseline', 'jev'));
