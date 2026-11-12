alter table title_mal
  add column if not exists matched_by text check (matched_by in ('score', 'jev'));
