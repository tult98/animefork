-- Local development only. These passwords are public on purpose.
create role authenticator login noinherit password 'local-authenticator';
create role art_sync login password 'local-art-sync';
