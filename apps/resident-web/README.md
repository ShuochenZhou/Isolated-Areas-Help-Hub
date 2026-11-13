# Resident web compiler and runtime

The resident web application compiles the canonical WeChat application from
`../resident-miniapp`. Page structure, styles, business logic, and resident-facing content therefore
remain shared between the native and browser clients; only platform services are adapted.

## Compiler

- `src/compiler/wxml.ts` converts WXML control flow, loops, events, datasets, and hover behavior into
  Vue render functions.
- `src/compiler/wxss.ts` converts units and selectors while preserving page-level cascade behavior.
- `src/compiler/plugin.ts` exposes page modules, configuration, render functions, styles, and assets
  through Vite virtual modules.
- `miniapp.manifest.json` records SHA-256 hashes of the canonical client and is checked before every
  production build.

## Runtime

`src/runtime` implements the WeChat application lifecycle, page stack, `setData` paths, tab navigation,
storage, networking, dialogs, location views, maps, and supported `wx.*` APIs. Browser identity uses a
random device key whose hash is stored separately from WeChat identity.

## Commands

```bash
npm ci
npm run verify
npm test
npm run build
npm run dev
```

Intentional changes to the canonical WeChat application require a reviewed manifest update:

```bash
npm run manifest
```

To replace the canonical source from another reviewed release:

```bash
npm run sync -- /path/to/resident-miniapp
```

The build fails on unsupported components or WXML constructs instead of silently rendering an
incomplete page.

## Platform adaptations

| WeChat capability | Browser implementation |
| --- | --- |
| WeChat identity headers | Random device key; the backend stores only its SHA-256 hash |
| `wx.cloud.callContainer` | Same-origin HTTPS under `/api` |
| Native map component | Leaflet with GCJ-02-aware map sources and fallback tiles |
| `wx.openLocation` | A browser location page with installed navigation providers |
| Phone and clipboard APIs | Standard browser and operating-system capabilities |
| WeChat Pay and subscriptions | Disabled in the browser runtime |

Deployment details are documented in `deploy/DEPLOY.md`.
