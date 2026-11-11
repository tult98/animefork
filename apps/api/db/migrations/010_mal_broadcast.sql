alter table title_mal
  add column if not exists mal_broadcast_day text
    check (mal_broadcast_day in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')),
  add column if not exists mal_broadcast_time text
    check (mal_broadcast_time ~ '^\d\d:\d\d$'),
  add constraint title_mal_broadcast_time_needs_day
    check (mal_broadcast_day is not null or mal_broadcast_time is null);
