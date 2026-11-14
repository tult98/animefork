create table if not exists user_title_ratings (
  user_id uuid not null references users on delete cascade,
  slug text not null,
  rating text not null check (rating in ('like', 'dislike')),
  title_name text not null,
  image text not null,
  genres text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, slug)
);

create index if not exists user_title_ratings_user_updated_idx
  on user_title_ratings (user_id, updated_at desc);

create table if not exists playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists playlists_user_name_idx
  on playlists (user_id, lower(name));

create table if not exists playlist_items (
  playlist_id uuid not null references playlists on delete cascade,
  slug text not null,
  title_name text not null,
  image text not null,
  genres text[] not null default '{}',
  added_at timestamptz not null default now(),
  primary key (playlist_id, slug)
);

create index if not exists playlist_items_added_idx
  on playlist_items (playlist_id, added_at desc);
