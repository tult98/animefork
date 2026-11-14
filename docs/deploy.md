# Deploying to a VPS

Everything runs in Docker Compose from `deploy/`: Postgres, the API, and Caddy serving the web app.
There is no domain yet, so the site is plain HTTP on the server's IP. Caddy sends `/v1/*` and `/healthz` to the API and everything else to the web app, so the browser sees one origin.

## One-time server setup

1. Ubuntu LTS VPS with at least 2 GB RAM (the image build needs it). Create a non-root user, use SSH keys only, and open ports 22 and 80 in the firewall.
2. Install Docker Engine and the compose plugin, then add your user to the `docker` group.
3. Clone the repo to `~/animefork`. Use a read-only deploy key if the repo is private.
4. Create `~/animefork/deploy/.env` from `deploy/.env.example`:
   - `PUBLIC_URL` is `http://<server-ip>`, no trailing slash. It is compiled into the web bundle and used for CORS.
   - `POSTGRES_PASSWORD` is a long random string.
   - `TMDB_API_KEY` is required. The API does not start without it.
   - `COOKIE_SECURE`, `SESSION_TTL_DAYS` and `MAIL_FROM` are optional and set up accounts. The session cookie is `Secure` by default, so browsers send it only over HTTPS. On plain HTTP, sign-in works only with `COOKIE_SECURE=0`. Mailed links point at `PUBLIC_URL`.
5. `cd ~/animefork/deploy && docker compose up -d --build`
6. Check: `curl http://<server-ip>/healthz` returns `{"ok":true}`.

Migrations in `apps/api/db/migrations` run when the API starts. Nothing else to do.

## Updating

Either run `git pull && docker compose up -d --build` in `deploy/` on the server, or run the **Deploy** workflow from the GitHub Actions tab. It needs three repository secrets: `VPS_HOST`, `VPS_USER` and `VPS_SSH_KEY`.

If you change `PUBLIC_URL`, the web image must be rebuilt (`up -d --build` does that).

The workflow cleans up after itself: `docker image prune -f` removes the previous app images, and `docker builder prune` removes build cache older than a week. Database volumes are never touched. If you update by hand, run the same two commands afterwards so the disk does not fill up.

## Running a backfill

The image carries the one-off jobs compiled to `dist/scripts/`. They read the same env as the API. Run them after a deploy, so the API has applied the migrations, and one at a time, since both share the MAL and Tenrai rate limits with the running API. In `deploy/`, run the MAL pass first and the trailers after it, because the trailer pass only reads rows the MAL pass matched:

```bash
docker compose exec api node dist/scripts/backfill-mal.js --limit=20
docker compose exec api node dist/scripts/backfill-trailers.js --limit=20
```

Drop `--limit` to take every row. `apps/api/README.md` describes both under **MyAnimeList**.

## Backups

`deploy/backup.sh` dumps the database with `pg_dump` into `~/backups/api-<date>.sql.gz` and deletes dumps older than 14 days. Change the location or retention with `BACKUP_DIR` and `RETENTION_DAYS`.

```bash
~/animefork/deploy/backup.sh
```

Run it nightly from cron (`crontab -e`):

```
0 3 * * * $HOME/animefork/deploy/backup.sh >> $HOME/backups/backup.log 2>&1
```

Create `~/backups` once first, because cron opens the log before the script runs. The dumps sit on the same disk as the database volume, so also copy them to another machine, for example with `rsync` or `scp` from your laptop. That is what protects you if the VPS is lost.

To restore a dump into a running stack:

```bash
gunzip -c ~/backups/api-2026-11-12-0300.sql.gz | docker compose exec -T db psql -U api api
```

Most of the data is cached art and ratings lookups, which can be rebuilt at the cost of TMDB and model calls. The `users` table cannot be rebuilt. Losing it loses every account.

## Caveats

- The web app reads anime pages through the AnimeVsub Helper extension in each visitor's browser. Visitors need it installed, and it must allow your server's address.
- The site must be served over HTTPS: the player uses `crypto.subtle`, which browsers only provide on HTTPS or localhost.
- The domain is `animefork.com`: A records for `animefork.com` and `www` point at the server, ports 80 and 443 are open, and `PUBLIC_URL=https://animefork.com` in `deploy/.env`. Caddy gets the certificate by itself.
