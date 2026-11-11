create table if not exists title_mal (
  source_slug text primary key,
  status text not null check (status in ('ok', 'none', 'failed')),
  mal_id integer,
  mal_score numeric(4, 2) check (mal_score between 0 and 10),
  mal_voters integer check (mal_voters >= 0),
  mal_rank integer check (mal_rank > 0),
  mal_popularity integer check (mal_popularity > 0),
  mal_members integer check (mal_members >= 0),
  matched_title text,
  match_score numeric(4, 3),
  matcher_version integer not null default 1,
  reason text,
  attempted_at timestamptz not null default now(),
  fetched_at timestamptz,
  constraint title_mal_ok_has_id check (
    status <> 'ok' or (mal_id is not null and fetched_at is not null)
  )
);
