# Deploy runbook (single VPS)

## First-time VPS setup
1. Ubuntu 22.04+, install Docker + compose plugin, `awscli`, `openssl`, `git`; open ports 80/443 only.
2. `git clone <repo> /opt/sembako && cd /opt/sembako`; create a deploy user with SSH key (add to GitHub secrets).
3. Create `/opt/sembako/.env` (never commit) from `.env.example`. Required in prod:
   `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET` (≥32 random chars), `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
   `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE`, `LOG_LEVEL`, `BACKUP_S3_BUCKET`, `BACKUP_PASSPHRASE`.
   `DATABASE_URL` is injected by compose. `PORT`, token TTLs optional.
   Payments: `XENDIT_SECRET_KEY` (`xnd_production_…`), `XENDIT_CALLBACK_TOKEN`, `XENDIT_TEST_MODE=false`, `CUSTOMER_WEB_URL`
   (public customer-web origin). In the Xendit dashboard set the invoice callback URL to
   `https://api.example.com/api/v1/webhooks/xendit` with the same verification token. The worker runs the 5-minute
   payment reconciliation, so it needs the same Xendit variables.
4. Replace `api.example.com` in `infra/nginx/conf.d/api.conf` (and the 3 `netlify.toml` files).
5. GitHub secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `GHCR_PULL_TOKEN` (PAT, read:packages).

## TLS (certbot)
1. Point DNS A record at the VPS. `sudo certbot certonly --standalone -d api.example.com`
   (before nginx is up; afterwards use `--webroot -w /var/lib/docker/volumes/<project>_certbot-webroot/_data`).
2. Renewal: `certbot renew --deploy-hook "docker compose -f /opt/sembako/infra/docker/compose.prod.yml exec nginx nginx -s reload"`.

## Deploy
- Push to `main` touching api/db/infra/packages → `deploy-api` runs test → image to GHCR → SSH: pull, migrate, `up -d`, health check.
- Manual: `set -a; . ./.env; set +a; export API_IMAGE=ghcr.io/<owner>/2m-api:<sha>` then
  `docker compose -f infra/docker/compose.prod.yml up -d`.
- Frontends: connect each app's `netlify.toml` to Netlify (one site per app).
- Backups: cron `0 3 * * *` (see `infra/scripts/backup.sh`); verify monthly with `infra/scripts/restore-test.sh`.

## Rollback
1. `cat /opt/sembako/.previous_image` → previous image tag.
2. `set -a; . ./.env; set +a; export API_IMAGE=$(cat .previous_image)`
3. `docker compose -f infra/docker/compose.prod.yml up -d api worker`; check `curl -fsS https://api.example.com/health`.
4. Migrations are forward-only: if a migration broke data, restore from the latest backup instead.
