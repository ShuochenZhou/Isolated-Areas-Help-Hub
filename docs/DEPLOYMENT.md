# Production deployment

## Topology

- Terminate TLS at a managed load balancer or Nginx ingress.
- Run the backend with `SPRING_PROFILES_ACTIVE=production` so development login and seed data are disabled.
- Use managed MySQL with automated point-in-time backups, managed Redis, and durable RabbitMQ storage.
- Serve the admin console from the same HTTPS origin or set an explicit allowed CORS origin.
- Register the backend HTTPS hostname as a WeChat application request domain.

## Required secrets

Generate unique production values for `JWT_SECRET`, `PICKUP_CODE_SECRET`, database, Redis, RabbitMQ, Grafana, LLM, WeChat, and WeChat Pay credentials. Never place `WECHAT_APP_SECRET`, the LLM key, the API v3 key, or merchant private key in the WeChat application or web bundle. Restrict `TENCENT_MAP_WEB_KEY` to the admin hostname. Mount `apiclient_key.pem` read-only into the backend container and set `WECHAT_PAY_PRIVATE_KEY_PATH` to that in-container path.

## WeChat release checklist

1. Confirm `apps/resident-miniapp/project.config.json` uses the registered AppID, and replace the local API URL with the registered production HTTPS request domain.
2. Set `useDevLogin` to `false`.
3. Do not reintroduce `wx.getLocation` or `wx.chooseLocation` without approved geolocation-interface access under WeChat Console > Development Management > Interface Settings. Residents currently choose coordinates on the in-app map at `pages/place`.
4. Choose a subscription template with three fields and configure their exact keys in the server and WeChat application config.
5. Test `wx.login`, opt-in subscription consent, request creation, and a real template delivery in the WeChat trial version.
6. If the entity has a qualified merchant account, bind the WeChat application AppID to it, register both HTTPS callback URLs, complete the one-fen payment/refund launch test in `PAYMENTS.md`, and only then set the resident `paymentsEnabled` switch to `true`. Otherwise keep paid catalog items closed and verify the free flow.

## Database and rollback

- Back up MySQL before applying Flyway migrations.
- Application deployments are rolling and backward-compatible; database migrations are forward-only.
- Roll back the application image first. Restore a database backup only for a verified destructive migration incident.
- Test restore procedures quarterly; a backup without a restore test is not accepted as recoverable.

## Operations

- Alert on API p95, 5xx rate, database pool saturation, RabbitMQ queue depth, notification failures, and inventory below threshold.
- Scale stateless backend replicas when p95 exceeds the objective under sustained CPU or pool utilization.
- Increase RabbitMQ consumer concurrency only after observing queue depth; do not add microservices solely for anticipated traffic.
- The local k6 baseline is documented in `VERIFICATION.md`. Re-run it in staging with production-sized database and network latency before setting replica counts or publishing capacity figures.
