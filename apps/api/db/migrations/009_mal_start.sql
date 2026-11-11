alter table title_mal
  add column if not exists mal_start_date text
    check (mal_start_date ~ '^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$'),
  add column if not exists mal_start_year integer,
  add column if not exists mal_start_season text
    check (mal_start_season in ('winter', 'spring', 'summer', 'fall')),
  add column if not exists mal_dates_known boolean not null default false;
