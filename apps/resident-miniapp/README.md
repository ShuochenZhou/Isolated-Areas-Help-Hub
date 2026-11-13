# Resident WeChat application

This directory is the canonical resident and courier client. The browser client compiles these same
WXML, WXSS, JavaScript, and configuration files rather than maintaining a second interface.

## Development

1. Import this directory into WeChat Developer Tools as a WeChat application project.
2. Start the repository's Docker Compose stack.
3. Keep `useDevLogin` enabled in `config.js` for local development and disable request-domain checks
   in Developer Tools. The local API is `http://localhost:8081/api`.

For a real WeChat login, configure the AppID and AppSecret only in the backend environment, disable
development login, and recreate the backend container. Never place the AppSecret in this client,
source control, logs, or screenshots.

## Release controls

- Configure an approved HTTPS request domain before production submission.
- Residents choose a point on the in-app map; the client does not request restricted background or
  precise-location interfaces.
- Keep payments disabled until merchant credentials, callbacks, and payment/refund acceptance tests
  are complete.
- Configure a verified community service number before enabling phone actions.

Pickup codes are derived with a server-only HMAC secret. The client displays a code only while its
reservation remains eligible, and the database stores only the hash.
