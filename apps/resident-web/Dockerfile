# The web version: built static files served by nginx, which also forwards /api to the backend
# (BACKEND_URL), so the browser talks to one origin and needs no CORS.
FROM node:22-alpine AS build
# WeChat CloudRun builds in mainland China, where the npmmirror registry is fast and reliable;
# elsewhere pass --build-arg NPM_REGISTRY=https://registry.npmjs.org.
ARG NPM_REGISTRY=https://registry.npmmirror.com
WORKDIR /app
COPY apps/resident-web/package.json apps/resident-web/package-lock.json ./
RUN npm ci --no-audit --no-fund --registry="$NPM_REGISTRY"
COPY apps/resident-web ./
COPY apps/resident-miniapp /resident-miniapp
RUN npm run build

FROM nginx:1.27-alpine
ENV BACKEND_URL=http://backend:8080 \
    API_ALLOWED_ORIGIN="" \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY --from=build /app/deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
