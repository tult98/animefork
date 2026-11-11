create table if not exists title_ratings (
  source_slug text primary key,
  avs_score numeric(3, 1) check (avs_score between 0 and 10),
  avs_voters integer check (avs_voters >= 0),
  avs_fetched_at timestamptz,
  quality text,
  updated_at timestamptz not null default now(),
  constraint title_ratings_avs_complete check (
    (avs_score is null) = (avs_voters is null)
    and (avs_score is null) = (avs_fetched_at is null)
  )
);
