alter table title_mal drop constraint if exists title_mal_matched_by_check;
alter table title_mal
  add constraint title_mal_matched_by_check
  check (matched_by in ('score', 'jev', 'franchise'));
