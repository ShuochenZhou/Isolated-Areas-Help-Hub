-- Aggregate successfully computed route plans over the selected reporting interval.
--
-- Savings rate = (baseline distance - optimized distance) / baseline distance * 100.
-- The NULLIF guard leaves the rate undefined when no baseline distance is available.
SELECT
    COUNT(*) AS computed_plans,
    SUM(baseline_distance_meters) AS baseline_distance_meters,
    SUM(objective_distance_meters) AS optimized_distance_meters,
    SUM(baseline_distance_meters) - SUM(objective_distance_meters) AS distance_saved_meters,
    ROUND(
        100.0 * (
            SUM(baseline_distance_meters) - SUM(objective_distance_meters)
        ) / NULLIF(SUM(baseline_distance_meters), 0),
        2
    ) AS distance_saved_percent
FROM route_plans
WHERE status IN ('READY', 'DISPATCHED', 'COMPLETED')
  AND baseline_distance_meters IS NOT NULL
  AND objective_distance_meters IS NOT NULL
  AND EXISTS (
      SELECT 1
      FROM route_stops
      WHERE route_stops.route_plan_id = route_plans.id
  )
  AND completed_at >= :report_start
  AND completed_at < :report_end;
