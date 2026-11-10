-- Runs after the migration, which creates web_anon and art_writer.
grant web_anon to authenticator;
grant art_writer to art_sync;
grant usage on schema public to web_anon, art_writer;
