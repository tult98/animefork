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
5. `cd ~/animefork/deploy && docker compose up -d --build`
6. Check: `curl http://<server-ip>/healthz` returns `{"ok":true}`.

Migrations in `apps/api/db/migrations` run when the API starts. Nothing else to do.

## Updating

Either run `git pull && docker compose up -d --build` in `deploy/` on the server, or run the **Deploy** workflow from the GitHub Actions tab. It needs three repository secrets: `VPS_HOST`, `VPS_USER` and `VPS_SSH_KEY`.

If you change `PUBLIC_URL`, the web image must be rebuilt (`up -d --build` does that).

## Backups

```bash
docker compose exec -T db pg_dump -U api api | gzip > api-$(date +%F).sql.gz
```

Run it from cron and copy the file off the server. The data is cached art and ratings lookups, so it can be rebuilt, but that costs TMDB and model calls.

## Caveats

- The web app reads anime pages through the AnimeVsub Helper extension in each visitor's browser. Visitors need it installed, and it must allow your server's address.
- Plain HTTP means no encryption. Fine for a private test, not for sharing widely.
- When you get a domain: point an A record at the server, put the hostname in `deploy/Caddyfile` in place of `:80`, open port 443, set `PUBLIC_URL=https://<host>`, and rebuild. Caddy gets the certificate by itself.
