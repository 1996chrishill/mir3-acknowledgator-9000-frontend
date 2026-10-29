#!/bin/sh
# Runs from the nginx image's /docker-entrypoint.d at container start.
# Writes the runtime config read by the page, so the API URL isn't baked in at build time.
set -eu

js_str() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
num() { case "$1" in ''|*[!0-9]*) echo "$2" ;; *) echo "$1" ;; esac; }

cat > /usr/share/nginx/html/config.js <<CFG
window.APP_CONFIG = {
  API_URL: "$(js_str "${API_URL:-}")",
  REFRESH_SECONDS: $(num "${REFRESH_SECONDS:-}" 60),
  REQUEST_TIMEOUT_S: $(num "${REQUEST_TIMEOUT_S:-}" 180),
  HISTORY_LIMIT: $(num "${HISTORY_LIMIT:-}" 200)
};
CFG

echo "app-config: API_URL=${API_URL:-<same origin>}"
