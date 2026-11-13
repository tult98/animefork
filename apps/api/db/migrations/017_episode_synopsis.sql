alter table episode_info
  add column if not exists synopsis text,
  add column if not exists synopsis_vi text;

-- Lists stored before synopses existed are read again on their next lookup to fill them. Titles and their
-- translations are kept when Tenrai gives the same title.
delete from episode_list_sync;
