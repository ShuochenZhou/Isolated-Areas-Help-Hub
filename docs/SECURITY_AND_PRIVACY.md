# Security and privacy

- JWT authentication and method-level role checks separate residents, operators, and administrators. Operators can run service workflows; only administrators can adjust inventory, inspect audit/notification records, and export impact data.
- Residents can query only their own requests and reservations.
- Pickup codes are shown once and stored only as SHA-256 hashes.
- AI tool calls use an allow-list; state-changing tools require a single-use, five-minute Redis confirmation token.
- Inventory allocation and route planning are deterministic server operations, never LLM decisions.
- Location is collected only for service matching and dispatch. Do not expose exact resident coordinates in public reports.
- Audit logs retain administrative changes and correlation IDs without storing access tokens or secrets.
- Rate limiting fails open if Redis is unavailable so essential access is preserved; infrastructure alerts must treat that state as degraded protection.
- The production reverse proxy must replace client-supplied `X-Forwarded-For` headers and pass only the verified source chain; otherwise clients could evade IP-based rate limits.

Before a public launch, complete a data-retention schedule, privacy notice, resident consent text, incident-response contact, and access-review procedure. Export only aggregate impact data for public reporting.
