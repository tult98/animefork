alter table title_art add column if not exists overview text;
alter table title_art add column if not exists overview_lang text
  check (overview_lang in ('vi', 'en'));
alter table title_art add column if not exists overview_translated boolean not null default false;
alter table title_art add column if not exists overview_status text
  check (overview_status in ('ok', 'none', 'failed'));
alter table title_art add column if not exists overview_attempted_at timestamptz;
alter table title_art drop constraint if exists title_art_overview_ok;
alter table title_art add constraint title_art_overview_ok check (
  overview_status is distinct from 'ok'
  or (
    overview is not null
    and overview_lang is not null
    and overview_translated = (overview_lang = 'en')
  )
);
