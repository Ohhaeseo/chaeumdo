FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Map tile and place search providers (src/providers.ts). Empty values keep OpenStreetMap and Photon.
ARG VITE_MAP_TILE_URL=
ARG VITE_MAP_ATTRIBUTION=
ARG VITE_MAP_ATTRIBUTION_URL=
ARG VITE_PLACE_SEARCH_URL=
ARG VITE_PLACE_SEARCH_ATTRIBUTION=
ARG VITE_PLACE_SEARCH_ATTRIBUTION_URL=
RUN npm run build
# The Content-Security-Policy lets the browser reach only the providers this image was built for.
RUN origin() { printf '%s' "$1" | sed -E 's#^(https?://[^/]+).*#\1#'; }; \
    if [ -n "$VITE_MAP_TILE_URL" ]; then sed -i "s#https://tile.openstreetmap.org#$(origin "$VITE_MAP_TILE_URL")#" nginx-security-headers.conf; fi; \
    if [ -n "$VITE_PLACE_SEARCH_URL" ]; then sed -i "s#https://photon.komoot.io#$(origin "$VITE_PLACE_SEARCH_URL")#" nginx-security-headers.conf; fi; \
    grep -o "img-src[^;]*;\|connect-src[^;]*;" nginx-security-headers.conf

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Kept outside conf.d, which nginx would otherwise load at http level.
COPY --from=build /app/nginx-security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
