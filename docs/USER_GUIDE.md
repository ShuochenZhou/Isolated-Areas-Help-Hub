# Product workflows

## Resident clients

The native WeChat application and compiled web client expose the same resident workflow:

1. Sign in and maintain the resident name, household size, and service location.
2. Browse live inventory, nearby fixed service points, and mobile supply carts.
3. Submit a request with product, quantity, urgency, fulfillment method, location, accessibility
   notes, and preferred time. Idempotency keys protect retries from creating duplicates.
4. Follow the request through `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `SCHEDULED`, and a terminal
   `FULFILLED` or `REJECTED` state.
5. Reserve matching stock for an approved request. Subsidized items produce a pickup code directly;
   priced items remain unavailable until a qualified merchant configuration is enabled.
6. Track delivery progress, receive status notifications, and submit post-service feedback.
7. Use the assistant to query live inventory and resident-owned records or prepare an action. Every
   write requires a five-minute, user-bound, single-use confirmation token.

## Operations console

- **Overview:** service reach, fulfillment rate, median fulfillment time, route savings, stockouts,
  expiration rate, and satisfaction derived from completed service records.
- **Requests:** paginated review, legal state transitions, and assignment to a service resource.
- **Inventory:** stock levels and reorder thresholds, optimistic-lock updates, and pickup-code
  redemption.
- **Demand map:** raw demand points and configurable DBSCAN demand clusters.
- **Dispatch:** asynchronous route requests, ordered stops, unassigned demand, planned distance, and
  baseline distance.
- **Payments:** merchant orders, verified payment state, and full refunds for eligible reservations.
- **Governance:** correlated audit records, notification deliveries, and aggregate CSV exports.

## Dispatch calculation

The route worker reads approved requests and available carts with valid locations:

1. Prioritize jobs from `CRITICAL` through `LOW` urgency.
2. Respect each cart's remaining capacity when assigning work.
3. Build a feasible route from geographic distance and incremental trip cost.
4. Apply bounded 2-opt refinement, keeping only exchanges that shorten the route.
5. Store both planned distance and a baseline for the same assigned demand; capacity overflow remains
   explicitly unassigned for a later plan.

The dispatch estimator uses geographic distance with an explicit road factor. Resident navigation is
separate and delegates to the mapping application selected by the client.

## Data and asynchronous processing

- MySQL is authoritative for users, requests, inventory, reservations, routes, audit records, and
  impact events.
- Business changes and outbox events commit in the same transaction.
- RabbitMQ moves route computation and notifications outside the HTTP request path with retry and
  dead-letter handling.
- Redis stores rate-limit counters, short-lived confirmations, and frequently changing cart state;
  it is not the sole store for durable business facts.
- Prometheus and Grafana expose application, JVM, connection-pool, and messaging health.
