// Overwritten at container start from env vars (docker/40-app-config.sh).
// Edit this only for running the static files locally without Docker.
window.APP_CONFIG = {
  API_URL: "http://localhost:8080",
  REFRESH_SECONDS: 60,
  REQUEST_TIMEOUT_S: 180,
  HISTORY_LIMIT: 200
};
