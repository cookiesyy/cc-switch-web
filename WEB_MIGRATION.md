# CC Switch Web Migration

This fork keeps the original Tauri desktop app while adding a Linux web deployment path.

## Current Web Scope

Implemented first:

- HTTP API server based on the existing Rust services.
- Provider list/current/add/update/delete/switch APIs.
- Settings get/save APIs.
- Browser runtime guard for startup-only Tauri calls.
- Vite `/api` proxy to the Rust server.

Desktop-only features are still intentionally unsupported in web mode:

- System tray.
- Tauri updater.
- Native window controls.
- Native dialogs.
- Deep link registration.
- Opening local terminal windows.

## Development

Run the API server:

```bash
pnpm server
```

Run the web UI in another shell:

```bash
pnpm dev:web
```

Open:

```text
http://127.0.0.1:3000
```

The Vite dev server proxies `/api` to `http://127.0.0.1:15730`.

## Server Environment

- `CC_SWITCH_WEB_HOST`: default `127.0.0.1`
- `CC_SWITCH_WEB_PORT`: default `15730`

For a remote Linux server, keep the Rust API bound to localhost and expose the UI through Nginx/Caddy with authentication and HTTPS.
