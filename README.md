# Isolated Areas Help Hub

Isolated Areas Help Hub is a full-stack pickup and delivery platform for communities with limited
access to daily necessities. Residents request supplies through a WeChat application or its web
version, couriers complete capacity-constrained pickup and delivery routes, and administrators
manage inventory, requests, dispatch, and impact reporting.

The project was developed for the 2024 Millennium Fellowship at New York University Shanghai.

**Live site:** https://qingpu-help-hub.vercel.app

## Applications

- `apps/resident-miniapp`: the canonical WeChat application for residents and couriers.
- `apps/resident-web`: a Vue 3 browser runtime that compiles the canonical WXML, WXSS, JavaScript,
  and page configuration without maintaining a separate resident UI.
- `apps/admin-web`: a Vue 3 operations console for requests, inventory, dispatch, payments, and
  impact reporting.
- `services/backend`: a Java 21 and Spring Boot API backed by MySQL, Redis, and RabbitMQ.

## System design

The backend is a modular monolith. MySQL is the system of record, Redis holds short-lived state,
and RabbitMQ isolates asynchronous route-planning and notification work.

Key reliability properties include:

- idempotency records for retried resident writes;
- row locks for inventory reservations and dispatch state;
- optimistic version checks for concurrent edits;
- a transactional outbox for durable event publication;
- idempotent RabbitMQ consumers backed by processed-message records;
- single-use Redis confirmation tokens for assistant-initiated writes.

The resident assistant uses Qwen through an OpenAI-compatible endpoint. Its 23 allow-listed tools
read live application data or prepare bounded actions. Ownership checks protect resident-scoped
records, write operations require explicit confirmation, and a deterministic fallback remains
available during model outages.

Cart dispatch treats capacity-constrained pickup and delivery as a heuristic optimization problem.
Jobs are considered by urgency, assigned by incremental route cost subject to capacity, and refined
with 2-opt. Each completed plan stores both planned distance and a baseline distance. The aggregate
savings query is available in `analytics/route-savings.sql`.

## Repository layout

```text
.
├── apps/
│   ├── admin-web/
│   ├── resident-miniapp/
│   └── resident-web/
├── services/backend/
├── analytics/
├── docs/
├── infra/
├── tests/
├── .github/workflows/
└── docker-compose.yml
```

## Local development

Prerequisites:

- Docker Desktop with Docker Compose
- Node.js 22 for direct frontend development
- Java 21 and Maven 3.9 for direct backend development
- WeChat Developer Tools for the native WeChat application

Start the complete local stack:

```bash
cp .env.example .env
docker compose up --build
```

Local endpoints:

- Resident web app: http://localhost:8088
- Admin console: http://localhost:8080
- Backend API: http://localhost:8081/api
- OpenAPI UI: http://localhost:8081/swagger-ui.html
- RabbitMQ management: http://localhost:15672
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000

Import `apps/resident-miniapp` into WeChat Developer Tools to run the native client. External
credentials are optional for local development: the rule-based assistant fallback remains available
without an LLM key, while WeChat login, payments, maps, and Qwen require their corresponding values.

## Verification

```bash
cd services/backend
mvn verify

cd ../../apps/admin-web
npm ci
npm test
npm run build

cd ../resident-web
npm ci
npm test
npm run build

cd ../..
docker compose config --quiet
```

See `docs/ARCHITECTURE.md` for component boundaries, `docs/DEVELOPMENT.md` for development workflows,
and `docs/DEPLOYMENT.md` for production configuration and secret handling.
