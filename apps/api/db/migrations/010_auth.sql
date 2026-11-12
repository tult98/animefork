create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists users_email_key on users (lower(email));

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique,
  user_id uuid not null references users on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists sessions_user_id_idx on sessions (user_id);
create index if not exists sessions_expires_at_idx on sessions (expires_at);

create table if not exists pending_signups (
  token_hash bytea primary key,
  email text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists pending_signups_email_idx on pending_signups (lower(email));
create index if not exists pending_signups_expires_at_idx on pending_signups (expires_at);
