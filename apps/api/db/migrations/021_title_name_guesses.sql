create table if not exists title_name_guesses (
  source_slug text primary key,
  names text[] not null,
  guessed_at timestamptz not null
);
