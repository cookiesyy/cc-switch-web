import { createServer } from "node:http";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { homedir } from "node:os";

const HOST = process.env.CC_SWITCH_WEB_HOST || "0.0.0.0";
const PORT = Number(process.env.CC_SWITCH_WEB_PORT || 15730);
const DATA_DIR = process.env.CC_SWITCH_WEB_DATA_DIR || join(homedir(), ".cc-switch-web");
const STATE_PATH = join(DATA_DIR, "state.json");
const STATIC_DIR = process.env.CC_SWITCH_WEB_STATIC_DIR || "";

const APPS = ["claude", "claude-desktop", "codex", "gemini", "opencode", "openclaw", "hermes"];

const defaultState = () => ({
  settings: {
    visibleApps: {
      claude: true,
      "claude-desktop": false,
      codex: true,
      gemini: true,
      opencode: true,
      openclaw: true,
      hermes: false,
    },
    language: "zh",
    theme: "system",
    minimizeToTrayOnClose: false,
  },
  providers: Object.fromEntries(APPS.map((app) => [app, {}])),
  current: Object.fromEntries(APPS.map((app) => [app, ""])),
  mcp: {},
  skills: {},
  skillRepos: [],
  prompts: Object.fromEntries(APPS.map((app) => [app, {}])),
});

async function ensureDir(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(path, data) {
  await ensureDir(dirname(path));
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, path);
}

async function backupExistingFile(path) {
  if (!existsSync(path)) return;
  const backupPath = `${path}.cc-switch-web.bak`;
  if (existsSync(backupPath)) return;
  await copyFile(path, backupPath);
}

async function loadState() {
  const state = await readJson(STATE_PATH, defaultState());
  return {
    ...defaultState(),
    ...state,
    providers: { ...defaultState().providers, ...(state.providers || {}) },
    current: { ...defaultState().current, ...(state.current || {}) },
    mcp: { ...defaultState().mcp, ...(state.mcp || {}) },
    skills: { ...defaultState().skills, ...(state.skills || {}) },
    prompts: { ...defaultState().prompts, ...(state.prompts || {}) },
    skillRepos: Array.isArray(state.skillRepos) ? state.skillRepos : [],
  };
}

async function saveState(state) {
  await writeJsonAtomic(STATE_PATH, state);
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

function contentType(path) {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}

async function sendStatic(req, res) {
  if (!STATIC_DIR || (req.method !== "GET" && req.method !== "HEAD")) return false;

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const decodedPath = decodeURIComponent(url.pathname);
  const relative = normalize(decodedPath).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]/, "");
  let filePath = join(STATIC_DIR, relative || "index.html");

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, "index.html");
  } catch {
    filePath = join(STATIC_DIR, "index.html");
  }

  const body = await readFile(filePath);
  res.writeHead(200, {
    "Content-Type": contentType(filePath),
    "Content-Length": body.length,
  });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  res.end(body);
  return true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error(`Invalid JSON body: ${error.message}`));
      }
    });
    req.on("error", reject);
  });
}

function assertApp(app) {
  if (!APPS.includes(app)) throw new Error(`Unsupported app: ${app}`);
}

function getProviderCustomEndpoints(provider) {
  const map = provider?.meta?.custom_endpoints;
  if (!map || typeof map !== "object") return [];
  return Object.values(map)
    .filter((item) => item && typeof item.url === "string")
    .sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0) || a.url.localeCompare(b.url));
}

function setProviderCustomEndpoints(provider, endpoints) {
  if (!provider.meta || typeof provider.meta !== "object") provider.meta = {};
  provider.meta.custom_endpoints = Object.fromEntries(
    endpoints.map((ep) => [ep.url, ep]),
  );
}

function codexPaths() {
  return {
    dir: join(homedir(), ".codex"),
    auth: join(homedir(), ".codex", "auth.json"),
    config: join(homedir(), ".codex", "config.toml"),
  };
}

function claudeSettingsPath() {
  return join(homedir(), ".claude", "settings.json");
}

async function applyProviderToLive(app, provider) {
  if (app === "codex") {
    const paths = codexPaths();
    await ensureDir(paths.dir);
    const auth = provider.settingsConfig?.auth;
    const config = provider.settingsConfig?.config;
    if (auth && typeof auth === "object") {
      await backupExistingFile(paths.auth);
      await writeJsonAtomic(paths.auth, auth);
    }
    if (typeof config === "string") {
      await backupExistingFile(paths.config);
      await writeFile(paths.config, config, { mode: 0o600 });
    }
    return;
  }

  if (app === "claude") {
    const settings = provider.settingsConfig;
    if (settings && typeof settings === "object") {
      await backupExistingFile(claudeSettingsPath());
      await writeJsonAtomic(claudeSettingsPath(), settings);
    }
  }
}

async function testSingleEndpoint(url, timeoutSecs = 8) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSecs * 1000);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return {
      url,
      latency: Date.now() - startedAt,
      status: response.status,
    };
  } catch (error) {
    clearTimeout(timer);
    return {
      url,
      latency: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchModelsForConfig({
  baseUrl,
  apiKey,
  isFullUrl,
  modelsUrl,
}) {
  const trim = (value) => String(value || "").trim().replace(/\/+$/, "");
  const normalizedBase = trim(baseUrl);
  const candidates = [];

  if (modelsUrl) {
    candidates.push(trim(modelsUrl));
  } else if (normalizedBase) {
    const baseWithoutV1 = normalizedBase.replace(/\/v1$/, "");
    candidates.push(
      isFullUrl ? normalizedBase : `${normalizedBase}/models`,
      isFullUrl ? normalizedBase : `${baseWithoutV1}/v1/models`,
    );

    if (normalizedBase.endsWith("/anthropic")) {
      const root = normalizedBase.replace(/\/anthropic$/, "");
      candidates.push(`${root}/models`, `${root}/v1/models`);
    }
  }

  const unique = [...new Set(candidates.filter(Boolean))];
  if (unique.length === 0) throw new Error("Base URL is required");

  let lastError = "No model endpoint succeeded";
  for (const url of unique) {
    try {
      const response = await fetch(url, {
        headers: apiKey
          ? {
              Authorization: `Bearer ${apiKey}`,
            }
          : {},
      });
      if (!response.ok) {
        lastError = `HTTP ${response.status} @ ${url}`;
        continue;
      }
      const json = await response.json();
      const data = Array.isArray(json?.data) ? json.data : [];
      return data
        .filter((item) => item && typeof item.id === "string")
        .map((item) => ({
          id: item.id,
          ownedBy: item.owned_by ?? item.ownedBy ?? null,
        }));
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(`All candidates failed: ${lastError}`);
}

async function route(req, res) {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const parts = url.pathname.split("/").filter(Boolean);

  if (url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, service: "cc-switch-web-node" });
  }

  const state = await loadState();

  if (url.pathname === "/api/settings" && req.method === "GET") {
    return sendJson(res, 200, state.settings);
  }

  if (url.pathname === "/api/settings" && req.method === "PUT") {
    state.settings = { ...state.settings, ...(await readBody(req)) };
    await saveState(state);
    return sendJson(res, 200, true);
  }

  if (url.pathname === "/api/config/export" && req.method === "GET") {
    return sendJson(res, 200, state);
  }

  if (url.pathname === "/api/config/import" && req.method === "POST") {
    const body = await readBody(req);
    await saveState({
      ...defaultState(),
      ...body,
      providers: { ...defaultState().providers, ...(body.providers || {}) },
      current: { ...defaultState().current, ...(body.current || {}) },
      mcp: body.mcp || {},
      skills: body.skills || {},
      prompts: { ...defaultState().prompts, ...(body.prompts || {}) },
      skillRepos: Array.isArray(body.skillRepos) ? body.skillRepos : [],
    });
    return sendJson(res, 200, {
      success: true,
      message: "Imported",
      backupId: null,
    });
  }

  if (url.pathname === "/api/models/fetch" && req.method === "POST") {
    return sendJson(res, 200, await fetchModelsForConfig(await readBody(req)));
  }

  if (parts[0] === "api" && parts[1] === "config-dir" && req.method === "GET") {
    const app = parts[2];
    assertApp(app);
    const dirs = {
      claude: join(homedir(), ".claude"),
      "claude-desktop": join(homedir(), ".config", "Claude"),
      codex: join(homedir(), ".codex"),
      gemini: join(homedir(), ".gemini"),
      opencode: join(homedir(), ".config", "opencode"),
      openclaw: join(homedir(), ".config", "openclaw"),
      hermes: join(homedir(), ".hermes"),
    };
    return sendJson(res, 200, dirs[app]);
  }

  if (parts[0] === "api" && parts[1] === "endpoint-test" && req.method === "POST") {
    const { urls, timeoutSecs } = await readBody(req);
    if (!Array.isArray(urls)) throw new Error("urls must be an array");
    const results = await Promise.all(
      urls.map((url) => testSingleEndpoint(String(url), Number(timeoutSecs || 8))),
    );
    return sendJson(res, 200, results);
  }

  if (parts[0] === "api" && parts[1] === "providers") {
    const app = parts[2];
    assertApp(app);

    if (parts.length === 3 && req.method === "GET") {
      return sendJson(res, 200, state.providers[app] || {});
    }

    if (parts.length === 4 && parts[3] === "current" && req.method === "GET") {
      return sendJson(res, 200, state.current[app] || "");
    }

    if (parts.length === 3 && req.method === "POST") {
      const { provider } = await readBody(req);
      if (!provider?.id) throw new Error("provider.id is required");
      state.providers[app][provider.id] = provider;
      if (!state.current[app] && !["opencode", "openclaw", "hermes"].includes(app)) {
        state.current[app] = provider.id;
        await applyProviderToLive(app, provider);
      }
      await saveState(state);
      return sendJson(res, 200, true);
    }

    const id = decodeURIComponent(parts[3] || "");
    if (parts.length === 4 && req.method === "PUT") {
      const { provider, originalId } = await readBody(req);
      if (!provider?.id) throw new Error("provider.id is required");
      if (originalId && originalId !== provider.id) delete state.providers[app][originalId];
      state.providers[app][provider.id] = provider;
      if (state.current[app] === originalId) state.current[app] = provider.id;
      await saveState(state);
      return sendJson(res, 200, true);
    }

    if (parts.length === 4 && req.method === "DELETE") {
      delete state.providers[app][id];
      if (state.current[app] === id) state.current[app] = "";
      await saveState(state);
      return sendJson(res, 200, true);
    }

    if (parts.length === 5 && parts[4] === "switch" && req.method === "POST") {
      const provider = state.providers[app]?.[id];
      if (!provider) throw new Error(`Provider not found: ${id}`);
      state.current[app] = id;
      await applyProviderToLive(app, provider);
      await saveState(state);
      return sendJson(res, 200, { warnings: [] });
    }

    if (parts.length === 5 && parts[4] === "custom-endpoints" && req.method === "GET") {
      const provider = state.providers[app]?.[id];
      if (!provider) throw new Error(`Provider not found: ${id}`);
      return sendJson(res, 200, getProviderCustomEndpoints(provider));
    }

    if (parts.length === 5 && parts[4] === "live-settings" && req.method === "GET") {
      const provider = state.providers[app]?.[id];
      if (!provider) throw new Error(`Provider not found: ${id}`);
      return sendJson(res, 200, provider.settingsConfig || {});
    }

    if (parts.length === 5 && parts[4] === "custom-endpoints" && req.method === "POST") {
      const provider = state.providers[app]?.[id];
      if (!provider) throw new Error(`Provider not found: ${id}`);
      const body = await readBody(req);
      const url = String(body.url || "").trim().replace(/\/+$/, "");
      if (!url) throw new Error("url is required");
      const endpoints = getProviderCustomEndpoints(provider);
      if (!endpoints.some((item) => item.url === url)) {
        endpoints.push({ url, addedAt: Date.now() });
      }
      setProviderCustomEndpoints(provider, endpoints);
      await saveState(state);
      return sendJson(res, 200, true);
    }

    if (parts.length === 6 && parts[4] === "custom-endpoints" && req.method === "DELETE") {
      const provider = state.providers[app]?.[id];
      if (!provider) throw new Error(`Provider not found: ${id}`);
      const targetUrl = decodeURIComponent(parts[5]);
      const endpoints = getProviderCustomEndpoints(provider).filter(
        (item) => item.url !== targetUrl,
      );
      setProviderCustomEndpoints(provider, endpoints);
      await saveState(state);
      return sendJson(res, 200, true);
    }

    if (parts.length === 6 && parts[4] === "custom-endpoints" && parts[5] === "last-used" && req.method === "POST") {
      const provider = state.providers[app]?.[id];
      if (!provider) throw new Error(`Provider not found: ${id}`);
      const body = await readBody(req);
      const targetUrl = String(body.url || "").trim().replace(/\/+$/, "");
      const endpoints = getProviderCustomEndpoints(provider).map((item) =>
        item.url === targetUrl ? { ...item, lastUsed: Date.now() } : item,
      );
      setProviderCustomEndpoints(provider, endpoints);
      await saveState(state);
      return sendJson(res, 200, true);
    }
  }

  if (parts[0] === "api" && parts[1] === "mcp") {
    if (parts[2] === "servers" && req.method === "GET") {
      return sendJson(res, 200, state.mcp || {});
    }
    if (parts[2] === "servers" && req.method === "POST") {
      const body = await readBody(req);
      const server = body.server ?? body;
      if (!server?.id) throw new Error("server.id is required");
      state.mcp[server.id] = server;
      await saveState(state);
      return sendJson(res, 200, true);
    }
    if (parts[2] === "servers" && parts[3] && req.method === "DELETE") {
      delete state.mcp[decodeURIComponent(parts[3])];
      await saveState(state);
      return sendJson(res, 200, true);
    }
    if (parts[2] === "toggle-app" && req.method === "POST") {
      const { serverId, app, enabled } = await readBody(req);
      assertApp(app);
      const server = state.mcp?.[serverId];
      if (!server) throw new Error(`MCP server not found: ${serverId}`);
      server.apps = server.apps || {};
      server.apps[app] = Boolean(enabled);
      await saveState(state);
      return sendJson(res, 200, true);
    }
    if (parts[2] === "import-from-apps" && req.method === "POST") {
      return sendJson(res, 200, 0);
    }
    if (parts[2] === "validate-command" && req.method === "POST") {
      const { cmd } = await readBody(req);
      return sendJson(res, 200, Boolean(String(cmd || "").trim()));
    }
  }

  if (parts[0] === "api" && parts[1] === "skills") {
    if (parts[2] === "installed" && req.method === "GET") {
      return sendJson(res, 200, Object.values(state.skills || {}));
    }
    if (parts[2] === "backups" && req.method === "GET") {
      return sendJson(res, 200, []);
    }
    if (parts[2] === "install" && req.method === "POST") {
      const { skill, currentApp } = await readBody(req);
      if (!skill?.directory) throw new Error("skill.directory is required");
      const id = skill.id || skill.directory;
      const installedSkill = {
        id,
        name: skill.name || id,
        description: skill.description || "",
        directory: skill.directory,
        repoOwner: skill.repoOwner,
        repoName: skill.repoName,
        repoBranch: skill.repoBranch,
        readmeUrl: skill.readmeUrl,
        apps: Object.fromEntries(APPS.map((app) => [app, app === currentApp])),
        installedAt: Date.now(),
        updatedAt: Date.now(),
      };
      state.skills[id] = installedSkill;
      await saveState(state);
      return sendJson(res, 200, installedSkill);
    }
    if (parts[2] === "toggle-app" && req.method === "POST") {
      const { id, app, enabled } = await readBody(req);
      assertApp(app);
      const skill = state.skills?.[id];
      if (!skill) throw new Error(`Skill not found: ${id}`);
      skill.apps = skill.apps || {};
      skill.apps[app] = Boolean(enabled);
      await saveState(state);
      return sendJson(res, 200, true);
    }
    if (parts[2] === "uninstall" && req.method === "POST") {
      const { id } = await readBody(req);
      delete state.skills[id];
      await saveState(state);
      return sendJson(res, 200, {});
    }
    if (parts[2] === "restore-backup" && req.method === "POST") {
      throw new Error("Skill backup restore is not implemented in web mode");
    }
    if (parts[2] === "scan-unmanaged" && req.method === "GET") {
      return sendJson(res, 200, []);
    }
    if (parts[2] === "import-from-apps" && req.method === "POST") {
      return sendJson(res, 200, []);
    }
    if (parts[2] === "discover" && req.method === "GET") {
      return sendJson(res, 200, []);
    }
    if (parts[2] === "check-updates" && req.method === "GET") {
      return sendJson(res, 200, []);
    }
    if (parts[2] === "update" && req.method === "POST") {
      const { id } = await readBody(req);
      const skill = state.skills?.[id];
      if (!skill) throw new Error(`Skill not found: ${id}`);
      skill.updatedAt = Date.now();
      await saveState(state);
      return sendJson(res, 200, skill);
    }
    if (parts[2] === "repos" && req.method === "GET") {
      return sendJson(res, 200, state.skillRepos || []);
    }
    if (parts[2] === "repos" && req.method === "POST") {
      const { repo } = await readBody(req);
      if (!repo?.owner || !repo?.name) throw new Error("repo owner/name required");
      state.skillRepos = [
        ...(state.skillRepos || []).filter(
          (item) => !(item.owner === repo.owner && item.name === repo.name),
        ),
        repo,
      ];
      await saveState(state);
      return sendJson(res, 200, true);
    }
    if (parts[2] === "repos" && parts[3] && parts[4] && req.method === "DELETE") {
      const owner = decodeURIComponent(parts[3]);
      const name = decodeURIComponent(parts[4]);
      state.skillRepos = (state.skillRepos || []).filter(
        (item) => !(item.owner === owner && item.name === name),
      );
      await saveState(state);
      return sendJson(res, 200, true);
    }
  }

  if (await sendStatic(req, res)) return;

  sendJson(res, 404, { error: "Not found" });
}

const server = createServer((req, res) => {
  route(req, res).catch((error) => {
    console.error(error);
    sendJson(res, 400, { error: error.message || String(error) });
  });
});

await ensureDir(DATA_DIR);
server.listen(PORT, HOST, () => {
  console.log(`cc-switch-web API listening on http://${HOST}:${PORT}`);
  console.log(`state file: ${STATE_PATH}`);
});
