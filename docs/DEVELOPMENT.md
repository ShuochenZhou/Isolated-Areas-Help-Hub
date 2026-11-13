# Development

## Prerequisites

- Docker Desktop with Compose v2
- Node.js 22 for frontend and compiler development
- Java 21 and Maven 3.9 for direct backend development
- WeChat Developer Tools for the resident client

The complete stack builds inside Docker, so host Java, Maven, and Node installations are optional
unless a component is run directly.

## Local identities

The local profile exposes `POST /api/auth/dev-login` only when `app.auth.dev-login-enabled=true`.

- Admin phone: `13800000000`
- Operator phone: `13800000001`
- Resident phone: `13800000003`

Production configuration must disable development login and configure WeChat `code2session` credentials.

## Validation

```bash
cd services/backend && mvn verify
cd ../../apps/admin-web && npm ci && npm test && npm run build
cd ../resident-web && npm ci && npm test && npm run build
cd ../.. && docker compose up --build -d
```

Load tests live in `tests/load/` and must be run against a non-production environment.

```bash
k6 run -e API_BASE_URL=http://localhost:8081/api tests/load/resident-journey.js
```

The test objective is less than 1% failed requests and p95 below 500 ms for the read-heavy resident journey. These are acceptance thresholds, not claimed production results; record actual output before reporting a performance number.
