FROM nginx:stable-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/40-app-config.sh /docker-entrypoint.d/40-app-config.sh
# strip CRLF in case the repo was checked out on Windows
RUN sed -i 's/\r$//' /docker-entrypoint.d/40-app-config.sh \
 && chmod +x /docker-entrypoint.d/40-app-config.sh

COPY web/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=60s --timeout=5s --start-period=10s \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
