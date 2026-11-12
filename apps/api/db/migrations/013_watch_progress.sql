create table if not exists watch_progress (
  user_id uuid not null references users on delete cascade,
  slug text not null,
  episode_id text not null,
  position_s real not null check (position_s >= 0),
  duration_s real not null check (duration_s > 0),
  completed boolean not null default false,
  title_name text not null,
  image text not null,
  episode_label text not null,
  season_slug text,
  updated_at timestamptz not null default now(),
  primary key (user_id, slug, episode_id)
);

create index if not exists watch_progress_user_updated_idx
  on watch_progress (user_id, updated_at desc);
