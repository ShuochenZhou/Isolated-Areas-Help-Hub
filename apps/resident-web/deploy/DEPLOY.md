# Resident web deployment

The browser client and WeChat application use the same backend and database. A request submitted from
either client enters the same review and fulfillment workflow.

## Recommended topology

```text
Browser -> static web host -> HTTPS API gateway -> private Spring Boot service
WeChat application ---------------- WeChat CloudRun ----^
```

The gateway must remove all client-supplied `X-WX-*` identity headers before proxying browser
requests. The backend should not expose a public path that trusts platform-injected identity headers.

## Container deployment

The repository-level Compose file builds the web image with the canonical WeChat application available in
the Docker build context. The image serves static assets from Nginx and forwards `/api` to
`BACKEND_URL`.

Required gateway settings:

- `BACKEND_URL`: private backend origin;
- `API_ALLOWED_ORIGIN`: exact public web origin when cross-origin access is required;
- periodic DNS re-resolution for backends whose instance address changes during rolling releases.

## Static deployment

```bash
npm run bundle:vercel
npx vercel deploy .vercel-output --prod
```

Set `VITE_API_ORIGIN` to the hardened gateway origin at build time. Do not embed backend credentials,
WeChat secrets, map service secrets, or merchant material in the static bundle.

## Release checks

1. Run `npm run verify`, unit tests, type checking, and the production build.
2. Run the browser journey against a non-production environment.
3. Confirm the gateway strips platform identity headers and restricts allowed origins.
4. Confirm browser residents and WeChat residents remain separate identity types.
5. Confirm the resident web and native WeChat application render the same canonical release.
