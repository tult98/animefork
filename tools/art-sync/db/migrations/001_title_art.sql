-- Plain Postgres, safe to re-run. Login roles and passwords belong to the deployment, not to this file.

do $$
begin
  if not exists (select from pg_roles where rolname = 'web_anon') then
    create role web_anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'art_writer') then
    create role art_writer nologin;
  end if;
end
$$;

create table if not exists title_art (
  source_slug text primary key,
  tmdb_id integer not null,
  tmdb_season integer not null,
  backdrop_path text,
  backdrop_lang text,
  matched_at timestamptz not null default now()
);

create table if not exists episode_art (
  source_slug text not null,
  episode_number integer not null,
  still_path text not null,
  primary key (source_slug, episode_number)
);

grant select on title_art, episode_art to web_anon;
grant select, insert, update on title_art, episode_art to art_writer;
