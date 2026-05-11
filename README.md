# CC Switch Web

Web/server adaptation of [CC Switch](https://github.com/farion1231/cc-switch) for Linux servers.

This fork keeps the original React UI, adds a lightweight Node.js HTTP backend, and makes the core provider-management workflow usable from a browser on a Linux machine.

## Status

This is an early web migration, not a full replacement for the original Tauri desktop app.

Implemented:

- Browser-based React UI.
- Node.js API server that runs without Tauri/WebKit.
- Provider list, create, update, delete, and switch APIs.
- Settings read/write API.
- Web-mode runtime guards for desktop-only Tauri calls.
- Codex live config writes.
- Claude live config writes.
- Automatic one-time backup before overwriting live config files.

Current live config write support:

- Codex: `~/.codex/auth.json`, `~/.codex/config.toml`
- Claude: `~/.claude/settings.json`

Not fully migrated yet:

- Gemini/OpenCode/OpenClaw/Hermes live config writers.
- MCP, Skills, Prompts live sync.
- Usage dashboard backend.
- Local proxy/failover backend.
- WebDAV sync.
- Desktop features such as tray, native dialogs, updater, deep links, and window controls.

## Requirements

- Linux server
- Node.js 20+
- Corepack / pnpm

Rust is not required for the current Node backend runtime.

## Quick Start

```bash
git clone https://github.com/cookiesyy/cc-switch-web.git
cd cc-switch-web
corepack pnpm install
corepack pnpm server
```

In another shell:

```bash
corepack pnpm dev:web
```

Open:

```text
http://127.0.0.1:3000
```

The Vite dev server proxies `/api` to the backend at `http://127.0.0.1:15730`.

## Production Build

Build the web UI:

```bash
corepack pnpm build:web
```

The static frontend is emitted to `dist/`.

Run the API server:

```bash
corepack pnpm server
```

For production, put Nginx or Caddy in front of both the static files and `/api`.

## Docker

Build and run with Docker:

```bash
docker build -t cc-switch-web .
docker run -d \
  --name cc-switch-web \
  --restart unless-stopped \
  -p 3000:3000 \
  -v cc-switch-web-data:/data \
  -v "$HOME/.codex:/root/.codex" \
  -v "$HOME/.claude:/root/.claude" \
  cc-switch-web
```

Open:

```text
http://SERVER_IP:3000
```

Or use Docker Compose:

```bash
docker compose up -d --build
```

The container serves both the Web UI and `/api` from one Node.js process.

Default container environment:

```bash
CC_SWITCH_WEB_HOST=0.0.0.0
CC_SWITCH_WEB_PORT=3000
CC_SWITCH_WEB_DATA_DIR=/data
CC_SWITCH_WEB_STATIC_DIR=/app/dist
```

Important volumes:

- `/data`: Web backend state file.
- `/root/.codex`: mounted host Codex config directory.
- `/root/.claude`: mounted host Claude config directory.

If your CLI tools run under a non-root Linux user, mount that user's config directories instead:

```bash
-v /home/YOUR_USER/.codex:/root/.codex
-v /home/YOUR_USER/.claude:/root/.claude
```

## Environment Variables

```bash
CC_SWITCH_WEB_HOST=0.0.0.0
CC_SWITCH_WEB_PORT=15730
CC_SWITCH_WEB_DATA_DIR=~/.cc-switch-web
```

Defaults:

- `CC_SWITCH_WEB_HOST`: `0.0.0.0`
- `CC_SWITCH_WEB_PORT`: `15730`
- `CC_SWITCH_WEB_DATA_DIR`: `~/.cc-switch-web`

State file:

```text
~/.cc-switch-web/state.json
```

## API

Implemented endpoints:

```http
GET    /api/health
GET    /api/settings
PUT    /api/settings
GET    /api/config-dir/:app
GET    /api/providers/:app
POST   /api/providers/:app
GET    /api/providers/:app/current
PUT    /api/providers/:app/:id
DELETE /api/providers/:app/:id
POST   /api/providers/:app/:id/switch
```

Supported app IDs:

```text
claude
claude-desktop
codex
gemini
opencode
openclaw
hermes
```

## Security

Do not expose the backend directly to the public internet.

Recommended deployment:

- Bind the backend to `127.0.0.1`.
- Use Nginx/Caddy as the public entrypoint.
- Enable HTTPS.
- Add authentication before exposing the UI.
- Run under a dedicated Linux user, not `root`.
- Restrict permissions for `~/.cc-switch-web` and CLI config files.

The backend can write API keys into live CLI config files. Treat it as a sensitive admin tool.

If using Docker on a public server, put Nginx/Caddy with HTTPS and authentication in front of port `3000`.

## Backup Behavior

Before overwriting live config, the Node backend creates one backup if it does not already exist:

```text
~/.codex/auth.json.cc-switch-web.bak
~/.codex/config.toml.cc-switch-web.bak
~/.claude/settings.json.cc-switch-web.bak
```

## Development Notes

The original Tauri/Rust desktop code is still present. A Rust Axum server prototype exists at:

```text
src-tauri/src/bin/server.rs
```

On Ubuntu 20.04, current Tauri 2 desktop dependencies require GLib newer than the system version, so the active Web runtime uses `server/web-server.mjs` instead.

Useful commands:

```bash
corepack pnpm typecheck
corepack pnpm build:web
corepack pnpm server
corepack pnpm dev:web
```

## Upstream

This project is based on:

```text
https://github.com/farion1231/cc-switch
```

Original project license: MIT.

Please keep upstream attribution when redistributing or publishing derived versions.
