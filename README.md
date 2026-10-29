# mir3-acknowledgator-9000-frontend

Mobile-friendly web UI for [mir3-acknowledgator-9000](https://github.com/1996chrishill/mir3-acknowledgator-9000): see pending MIR3 notifications, ack them one at a time or all at once, and browse ack history.

Static HTML/JS/CSS served by `nginx:stable-alpine`. No build step, no framework.

## Features

- Pending list (incident, title, IDs) with per-item **Ack** and **Ack all** (no confirmation)
- Auto-refresh of the pending list (paused while the tab is hidden or a call is running)
- **History** tab (backend `GET /history`, newest first; auto-job acks are tagged `auto`)
- **Auto-ack** card: Start/Stop the backend job that acks all pending every 4 min (backend `AUTO_ACK_INTERVAL_S`) and stops itself after 15 min (backend `AUTO_ACK_MAX_DURATION_S`), with on/off/running status, next run, stop time and last run result. The job runs on the backend, so it keeps going with the page closed; it's off after any backend restart.
- Dry-run badge and online/busy/offline status from `/health`
- Spinner with elapsed time and disabled buttons while a call runs
- Handles `409` busy, `404` not pending, `424` failed (shows `error`, `detail`, and each `failed[]` item with its error)

## Configuration (env vars, read at container start)

| Var | Default | Notes |
|---|---|---|
| `API_URL` | same origin | Backend base URL as the browser reaches it, e.g. `https://mir3-ack-api.example.com` |
| `REFRESH_SECONDS` | `60` | Pending auto-refresh; `0` = off |
| `REQUEST_TIMEOUT_S` | `180` | Fetch timeout for `/pending` and ack calls |
| `HISTORY_LIMIT` | `200` | Max history entries shown |
| `HOST_PORT` | `32263` | compose only; container listens on 80 |

`docker/40-app-config.sh` writes these into `/config.js` at startup, so one image works with any backend.

**The backend must allow this origin:** set `CORS_ORIGINS=https://<this frontend's host>` on the backend.

## Deploy on Portainer

1. Stacks → Add stack → paste `docker-compose.example.yml`, replacing `YOUR_DOCKERHUB_USER`.
2. Environment variables: `API_URL` (and any optional ones).
3. Deploy. Put it behind the LAN-only reverse proxy on `HOST_PORT`.

LAN-only: the backend API has no auth. Don't expose either to the internet.

To update: push to `main`, wait for the Actions run, then Update the stack with **Re-pull image**.

## Run locally

```bash
docker build -t mir3-ack-frontend .
docker run --rm -p 32263:80 --env-file .env mir3-ack-frontend
```

Without Docker: edit `web/config.js`, then serve `web/` with any static server (e.g. `python -m http.server -d web 8000`).

## Docker Hub publishing (GitHub Actions)

`.github/workflows/docker-publish.yml` pushes `:latest` and `:sha-xxxx` on every push to `main`, and `:1.2.3` / `:1.2` on `v*` tags.

One-time setup, before the first push: GitHub repo → Settings → Secrets and variables → Actions:
- **Variables**: `DOCKERHUB_USERNAME`
- **Secrets**: `DOCKERHUB_TOKEN` (Docker Hub personal access token, Read & Write)

## License

AGPL-3.0. Derivatives, including ones run as a network service, must stay open source.
