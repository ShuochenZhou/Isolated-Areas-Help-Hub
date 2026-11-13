# Impact measurement

The official project goal is to identify Shanghai communities that struggle to obtain daily necessities and serve them with movable carts. The product therefore distinguishes activity metrics from outcome metrics.

## Auditable outcome metrics

- unique households and household members receiving at least one completed service (self-reported size, with a conservative one-person default);
- fulfilled requests and fulfillment rate;
- median time from request submission to fulfillment;
- average self-reported travel minutes saved from optional post-service feedback;
- number of fulfilled-demand clusters reached (DBSCAN, 1.5 km radius, at least two fulfilled requests);
- cart route distance and estimated distance saved against independent depot-to-household trips over the same stops;
- stock-out rate and reservation expiration rate;
- optional post-service satisfaction.

Every metric is derived from `impact_events`, completed requests, reservations, routes, and self-reported household profiles. Development seed data exists only outside the production Flyway location.

## Baselines

- Collect the resident's estimated previous travel time/distance when consent is granted.
- Store optional previous and current travel minutes in post-service feedback.
- Compare each optimized multi-stop route with the sum of independent depot-to-household round trips over the same assigned stops.

## Reporting integrity

Do not claim projected targets as achieved impact. Export metrics only after removing test data and checking the SQL against a random sample of completed service records.
