# Deploy Lensmith (Docker + Baota + CI)

Production layout: Docker Compose binds the app to `127.0.0.1:8080`. Baota Nginx reverse-proxies public `:80` to that address. GitHub Actions builds images on `ubuntu-latest`, pushes to GHCR, then a **self-hosted runner** on the VPS pulls and restarts.

## One-time server setup

### 1. Clone and start

```bash
sudo mkdir -p /opt
cd /opt
sudo git clone https://github.com/qing329191254/lensmith.git
cd lensmith

# Create /opt/lensmith/.env (do not commit). With compose network_mode=host for api,
# keep MySQL on loopback (typical Baota install):
#   DATABASE_URL=mysql+pymysql://user:pass@127.0.0.1:3306/lensmith
#   JWT_SECRET=...
# Do not point DATABASE_URL at host.docker.internal unless MySQL listens on the
# Docker bridge. Deploy runs ensure_db + alembic automatically.
# Note: api binds host :8000 — keep it firewalled from the public internet.

docker compose up -d --build
```

Confirm locally on the server:

```bash
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/
docker compose ps
```

### 2. Baota reverse proxy

1. Create a site (IP or domain).
2. Reverse proxy target: `http://127.0.0.1:8080`.
3. Keep Docker publishing only on localhost (see root `docker-compose.yml`).

### 3. Self-hosted GitHub Actions runner

1. Open the repo on GitHub → **Settings** → **Actions** → **Runners** → **New self-hosted runner**.
2. Choose Linux / x64 and follow the download + `./config.sh` steps (repo URL + token from that page).
3. Install as a service so it survives reboot:

```bash
sudo ./svc.sh install
sudo ./svc.sh start
```

The deploy job uses `runs-on: self-hosted` and expects the app at **`/opt/lensmith`**. If you clone elsewhere, change `working-directory` in [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).

### 4. GHCR pull access

After the first successful `build-and-push`, open each package on GitHub (**Packages**) and set visibility to **Public**, or log in once on the server:

```bash
# PAT needs read:packages (and write:packages if you push from the machine)
echo YOUR_PAT | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

## Continuous deploy

Every push to `main` (or manual **Run workflow**):

1. Cloud runner builds `lensmith-api` / `lensmith-web` and pushes `latest` + commit SHA tags.
2. Self-hosted runner runs `docker compose pull` and `docker compose up -d` in `/opt/lensmith`.

## Local Docker (dev / learning)

From the repo root:

```bash
docker compose up -d --build
```

Uses the same Compose file; `--build` builds from local Dockerfiles instead of only pulling GHCR.
