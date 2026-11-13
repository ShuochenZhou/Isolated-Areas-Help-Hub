# Architecture

## System context

```text
Canonical WeChat application --compile--> Resident Web Runtime
               \                              /
                \ HTTPS + JWT                /       Admin Web Console
                 \                          /               /
                    Spring Boot modular monolith
          ┌─────────────┼──────────────┬──────────────┐
        MySQL          Redis        RabbitMQ      Qwen API
    system of record  ephemeral      async jobs   intent parsing
                      state
```

## Module boundaries

1. **Client delivery**: one canonical WeChat application plus a compiler and browser runtime for users
   without WeChat; the admin console is an independent operations application.
2. **Identity and access**: WeChat login, browser device identity, local development login, JWTs, and
   resident/operator/admin roles.
3. **Needs and fulfillment**: resident requests, review workflow, reservations, inventory, and immutable audit records.
4. **Geospatial operations**: nearby carts, underserved-area clustering, and capacity-constrained route planning.
5. **Assistant**: an allow-listed agent that may read status or prepare state-changing actions. Mutations require explicit confirmation.
6. **Impact**: auditable completed-service events and aggregate outcome metrics.
7. **Integration**: transactional outbox, RabbitMQ consumers, notifications, and external map/LLM adapters.

## Data consistency

- MySQL is authoritative. Redis is never the only copy of a reservation, inventory count, request, or delivery.
- Inventory changes use transactions and optimistic version checks.
- Retry-prone resident request and reservation writes persist an `Idempotency-Key` result in MySQL.
- Business rows and outbox events commit in one transaction.
- Consumers are idempotent and retry through dead-letter queues.

## AI safety boundary

The LLM can select only allow-listed tools. Read-only tools execute immediately. Any tool that creates a request, reserves inventory, changes a route, or sends a notification produces a short-lived confirmation token; the user must confirm before execution. Route optimization and inventory allocation remain deterministic server-side algorithms.

## Scaling policy

- Initial deployment: one backend instance, managed MySQL/Redis, and one RabbitMQ node.
- Scale backend horizontally after CPU saturation or p95 API latency exceeds the service objective.
- Redis holds shared rate-limit, AI-confirmation, and cart-location state, so multiple backend replicas remain consistent.
- RabbitMQ absorbs notification and optimization bursts; worker concurrency is scaled from queue depth.
- Read replicas, sharding, Kafka, and microservices are intentionally excluded until measured load requires them.

## Why a modular monolith

The request, inventory, reservation, route, and impact modules share transactional invariants. Splitting them into microservices would require distributed transactions or compensating workflows without a measured independent scaling need. Stateless backend replicas can already scale horizontally behind a load balancer; route and notification bursts are isolated with RabbitMQ. A module should become a service only after it needs an independent release cadence, data ownership boundary, or sustained scaling profile.
