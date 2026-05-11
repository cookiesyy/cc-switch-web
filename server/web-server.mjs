import { createServer } from "node:http";
import { copyFile, cp, mkdir, readFile, readdir, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, normalize, basename } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import YAML from "yaml";

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
  skillBackups: [],
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

async function writeTextAtomic(path, text) {
  await ensureDir(dirname(path));
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, text, { mode: 0o600 });
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
    skillBackups: Array.isArray(state.skillBackups) ? state.skillBackups : [],
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

function geminiSettingsPath() {
  return join(homedir(), ".gemini", "settings.json");
}

function geminiEnvPath() {
  return join(homedir(), ".gemini", ".env");
}

function opencodeConfigPath() {
  return join(homedir(), ".config", "opencode", "opencode.json");
}

function openclawConfigPath() {
  return join(homedir(), ".config", "openclaw", "openclaw.json");
}

function hermesConfigPath() {
  return join(homedir(), ".hermes", "config.yaml");
}

function skillTargetDir(app) {
  switch (app) {
    case "claude":
      return join(homedir(), ".claude", "skills");
    case "claude-desktop":
      return join(homedir(), ".claude-desktop", "skills");
    case "codex":
      return join(homedir(), ".codex", "skills");
    case "gemini":
      return join(homedir(), ".gemini", "skills");
    case "opencode":
      return join(homedir(), ".config", "opencode", "skills");
    case "openclaw":
      return join(homedir(), ".openclaw", "skills");
    case "hermes":
      return join(homedir(), ".hermes", "skills");
    default:
      throw new Error(`Unsupported app: ${app}`);
  }
}

function getSkillSyncMethod(state) {
  return state.settings?.skillSyncMethod || "auto";
}

function hermesMemoriesDir() {
  return join(homedir(), ".hermes", "memories");
}

function hermesMemoryPath(kind) {
  return join(hermesMemoriesDir(), kind === "user" ? "USER.md" : "MEMORY.md");
}

function promptFilePath(app) {
  switch (app) {
    case "claude":
      return join(homedir(), ".claude", "CLAUDE.md");
    case "codex":
      return join(homedir(), ".codex", "AGENTS.md");
    case "gemini":
      return join(homedir(), ".gemini", "GEMINI.md");
    case "opencode":
      return join(homedir(), ".config", "opencode", "AGENTS.md");
    case "openclaw":
      return join(homedir(), ".openclaw", "AGENTS.md");
    case "hermes":
      return join(homedir(), ".hermes", "AGENTS.md");
    default:
      throw new Error(`Prompts unsupported for app: ${app}`);
  }
}

async function readJsonFileOr(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function readHermesYamlOr(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    const raw = await readFile(path, "utf8");
    return YAML.parse(raw) || fallback;
  } catch {
    return fallback;
  }
}

function serializeEnvMap(map) {
  return Object.entries(map || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

async function syncSkillToApp(skill, app, enabled) {
  const sourceDir = skill.directory;
  const targetRoot = skillTargetDir(app);
  const targetDir = join(targetRoot, basename(sourceDir));
  if (enabled) {
    await ensureDir(targetRoot);
    await rm(targetDir, { recursive: true, force: true });
    const state = await loadState();
    const method = getSkillSyncMethod(state);
    const shouldSymlink = method === "symlink" || method === "auto";

    if (shouldSymlink) {
      try {
        await symlink(sourceDir, targetDir, "dir");
        return;
      } catch {
        if (method === "symlink") throw new Error(`Failed to symlink skill to ${app}`);
      }
    }

    await cp(sourceDir, targetDir, { recursive: true });
  } else {
    await rm(targetDir, { recursive: true, force: true });
  }
}

async function syncSkillEverywhere(skill) {
  const apps = skill.apps || {};
  for (const app of APPS) {
    await syncSkillToApp(skill, app, Boolean(apps[app]));
  }
}

async function syncEnabledPromptToFile(state, app) {
  const prompts = state.prompts?.[app] || {};
  const enabledPrompt = Object.values(prompts).find((prompt) => prompt.enabled);
  const path = promptFilePath(app);
  await ensureDir(dirname(path));
  await writeTextAtomic(path, enabledPrompt ? String(enabledPrompt.content || "") : "");
}

async function backfillPromptFromLive(state, app) {
  const path = promptFilePath(app);
  if (!existsSync(path)) return;
  const content = await readFile(path, "utf8");
  if (!content.trim()) return;

  const prompts = state.prompts?.[app] || {};
  const enabledPrompt = Object.values(prompts).find((prompt) => prompt.enabled);
  if (enabledPrompt) {
    enabledPrompt.content = content;
    enabledPrompt.updatedAt = Math.floor(Date.now() / 1000);
    return;
  }

  const duplicated = Object.values(prompts).some(
    (prompt) => String(prompt.content || "").trim() === content.trim(),
  );
  if (duplicated) return;

  const id = `backup-${Date.now()}`;
  state.prompts[app][id] = {
    id,
    name: `Live Prompt Backup ${new Date().toISOString()}`,
    content,
    description: "Auto-backed up from existing live prompt file",
    enabled: false,
    createdAt: Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

async function scanSkillsFromAppDir(app) {
  const root = skillTargetDir(app);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const dir = join(root, entry.name);
    results.push({
      directory: entry.name,
      name: entry.name,
      path: dir,
      foundIn: [app],
      description: undefined,
    });
  }
  return results;
}

function omoVariantMeta(variant) {
  if (variant === "omo-slim") {
    return {
      category: "omo-slim",
      preferredFilename: "oh-my-opencode-slim.jsonc",
      candidates: ["oh-my-opencode-slim.jsonc", "oh-my-opencode-slim.json"],
    };
  }
  return {
    category: "omo",
    preferredFilename: "oh-my-openagent.jsonc",
    candidates: [
      "oh-my-openagent.jsonc",
      "oh-my-openagent.json",
      "oh-my-opencode.jsonc",
      "oh-my-opencode.json",
    ],
  };
}

function omoConfigPathCandidates(variant) {
  const base = join(homedir(), ".config", "opencode");
  return omoVariantMeta(variant).candidates.map((name) => join(base, name));
}

async function readOmoLocalFile(variant) {
  const path = omoConfigPathCandidates(variant).find((candidate) =>
    existsSync(candidate),
  );
  if (!path) throw new Error(`OMO config not found for ${variant}`);
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw.replace(/\/\/.*$/gm, ""));
  return {
    agents: parsed.agents || null,
    categories: parsed.categories || null,
    otherFields: Object.fromEntries(
      Object.entries(parsed).filter(([key]) => !["agents", "categories"].includes(key)),
    ),
    filePath: path,
    lastModified: new Date((await stat(path)).mtimeMs).toISOString(),
  };
}

async function extractZipToDir(buffer, destinationDir) {
  await rm(destinationDir, { recursive: true, force: true });
  await ensureDir(destinationDir);
  const zipPath = join(DATA_DIR, `.upload-${Date.now()}.zip`);
  await writeFile(zipPath, buffer, { mode: 0o600 });

  await new Promise((resolve, reject) => {
    const child = spawn("python3", [
      "-c",
      [
        "import sys, zipfile, os",
        "zip_path=sys.argv[1]",
        "dest=sys.argv[2]",
        "os.makedirs(dest, exist_ok=True)",
        "z=zipfile.ZipFile(zip_path)",
        "z.extractall(dest)",
        "z.close()",
      ].join("; "),
      zipPath,
      destinationDir,
    ]);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(stderr || `zip extraction failed: exit ${code}`));
    });
    child.on("error", reject);
  });

  await rm(zipPath, { force: true });
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
    return;
  }

  if (app === "gemini") {
    const env = provider.settingsConfig?.env;
    if (env && typeof env === "object") {
      await backupExistingFile(geminiEnvPath());
      await writeTextAtomic(geminiEnvPath(), `${serializeEnvMap(env)}\n`);
    }
    return;
  }

  if (app === "opencode") {
    const settings = provider.settingsConfig;
    if (settings && typeof settings === "object") {
      const existing = await readJsonFileOr(opencodeConfigPath(), {
        $schema: "https://opencode.ai/config.json",
        provider: {},
      });
      existing.provider = existing.provider || {};
      existing.provider[provider.id] = {
        ...(existing.provider[provider.id] || {}),
        ...settings,
      };
      await backupExistingFile(opencodeConfigPath());
      await writeJsonAtomic(opencodeConfigPath(), existing);
    }
    return;
  }

  if (app === "openclaw") {
    const settings = provider.settingsConfig;
    if (settings && typeof settings === "object") {
      const existing = await readJsonFileOr(openclawConfigPath(), {
        models: { mode: "merge", providers: {} },
      });
      existing.models = existing.models || {};
      existing.models.mode = existing.models.mode || "merge";
      existing.models.providers = existing.models.providers || {};
      existing.models.providers[provider.id] = {
        ...(existing.models.providers[provider.id] || {}),
        ...settings,
      };
      await backupExistingFile(openclawConfigPath());
      await writeJsonAtomic(openclawConfigPath(), existing);
    }
    return;
  }

  if (app === "hermes") {
    const settings = provider.settingsConfig;
    if (settings && typeof settings === "object") {
      const existing = await readHermesYamlOr(hermesConfigPath(), {});
      const providerName = settings.name || provider.id;
      const existingProviders = Array.isArray(existing.custom_providers)
        ? existing.custom_providers
        : [];
      const nextProvider = {
        ...(existingProviders.find((item) => item?.name === providerName) || {}),
        ...settings,
        name: providerName,
      };
      const providers = existingProviders
        ? existingProviders.filter((item) => item?.name !== providerName)
        : [];
      providers.push(nextProvider);
      existing.custom_providers = providers;

      const firstModel =
        Array.isArray(settings.models) && settings.models.length > 0
          ? settings.models[0].id
          : settings.model || existing.model?.default;
      existing.model = {
        ...(existing.model || {}),
        default: firstModel,
        provider: providerName,
        ...(settings.base_url ? { base_url: settings.base_url } : {}),
      };

      await backupExistingFile(hermesConfigPath());
      await writeTextAtomic(hermesConfigPath(), YAML.stringify(existing));
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

  if (parts[0] === "api" && parts[1] === "live-provider-ids" && req.method === "GET") {
    const app = parts[2];
    assertApp(app);
    if (app === "opencode") {
      const config = await readJsonFileOr(opencodeConfigPath(), {});
      return sendJson(res, 200, Object.keys(config.provider || {}));
    }
    if (app === "openclaw") {
      const config = await readJsonFileOr(openclawConfigPath(), {});
      return sendJson(res, 200, Object.keys(config.models?.providers || {}));
    }
    if (app === "hermes") {
      const config = await readHermesYamlOr(hermesConfigPath(), {});
      const providers = Array.isArray(config.custom_providers)
        ? config.custom_providers.map((item) => item?.name).filter(Boolean)
        : [];
      return sendJson(res, 200, providers);
    }
    return sendJson(res, 200, []);
  }

  if (parts[0] === "api" && parts[1] === "live-provider-settings" && req.method === "GET") {
    const app = parts[2];
    assertApp(app);
    if (app === "claude") {
      return sendJson(res, 200, await readJsonFileOr(claudeSettingsPath(), {}));
    }
    if (app === "gemini") {
      const envText = existsSync(geminiEnvPath()) ? await readFile(geminiEnvPath(), "utf8") : "";
      const env = Object.fromEntries(
        envText
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const idx = line.indexOf("=");
            return idx >= 0 ? [line.slice(0, idx), line.slice(idx + 1)] : [line, ""];
          }),
      );
      return sendJson(res, 200, { env });
    }
    return sendJson(res, 200, {});
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
      const { provider, addToLive } = await readBody(req);
      if (!provider?.id) throw new Error("provider.id is required");
      state.providers[app][provider.id] = provider;
      const shouldWriteLive = addToLive !== false;
      if (["opencode", "openclaw", "hermes"].includes(app)) {
        if (shouldWriteLive) {
          await applyProviderToLive(app, provider);
        }
      } else if (!state.current[app] || !state.providers[app][state.current[app]]) {
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
      if (app === "openclaw") {
        const config = await readJsonFileOr(openclawConfigPath(), {});
        return sendJson(
          res,
          200,
          config.models?.providers?.[id] || provider.settingsConfig || {},
        );
      }
      if (app === "opencode") {
        const config = await readJsonFileOr(opencodeConfigPath(), {});
        return sendJson(res, 200, config.provider?.[id] || provider.settingsConfig || {});
      }
      if (app === "hermes") {
        const config = await readHermesYamlOr(hermesConfigPath(), {});
        const match = Array.isArray(config.custom_providers)
          ? config.custom_providers.find((item) => item?.name === id || item?.name === provider.settingsConfig?.name)
          : null;
        return sendJson(res, 200, match || provider.settingsConfig || {});
      }
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
      return sendJson(res, 200, state.skillBackups || []);
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
      await syncSkillEverywhere(installedSkill);
      await saveState(state);
      return sendJson(res, 200, installedSkill);
    }
    if (parts[2] === "install-zip" && req.method === "POST") {
      const { fileName, currentApp, contentBase64 } = await readBody(req);
      const directoryName = String(fileName || "uploaded-skill").replace(/\.zip$/i, "");
      const destinationDir = join(DATA_DIR, "skills", directoryName);
      if (contentBase64) {
        await extractZipToDir(Buffer.from(String(contentBase64), "base64"), destinationDir);
      }
      let finalDirectory = destinationDir;
      try {
        const entries = await readdir(destinationDir, { withFileTypes: true });
        if (entries.length === 1 && entries[0].isDirectory()) {
          finalDirectory = join(destinationDir, entries[0].name);
        }
      } catch {
        // Keep destinationDir as fallback.
      }
      const id = directoryName;
      const installedSkill = {
        id,
        name: directoryName,
        description: `Imported from ZIP: ${fileName}`,
        directory: finalDirectory,
        apps: Object.fromEntries(APPS.map((app) => [app, app === currentApp])),
        installedAt: Date.now(),
        updatedAt: Date.now(),
      };
      state.skills[id] = installedSkill;
      await syncSkillEverywhere(installedSkill);
      await saveState(state);
      return sendJson(res, 200, [installedSkill]);
    }
    if (parts[2] === "toggle-app" && req.method === "POST") {
      const { id, app, enabled } = await readBody(req);
      assertApp(app);
      const skill = state.skills?.[id];
      if (!skill) throw new Error(`Skill not found: ${id}`);
      skill.apps = skill.apps || {};
      skill.apps[app] = Boolean(enabled);
      await syncSkillToApp(skill, app, Boolean(enabled));
      await saveState(state);
      return sendJson(res, 200, true);
    }
    if (parts[2] === "uninstall" && req.method === "POST") {
      const { id } = await readBody(req);
      const skill = state.skills?.[id];
      if (skill) {
        state.skillBackups.unshift({
          backupId: `backup-${Date.now()}`,
          backupPath: skill.directory,
          createdAt: Math.floor(Date.now() / 1000),
          skill,
        });
        for (const app of APPS) {
          await syncSkillToApp(skill, app, false);
        }
      }
      delete state.skills[id];
      await saveState(state);
      return sendJson(res, 200, {});
    }
    if (parts[2] === "restore-backup" && req.method === "POST") {
      const { backupId, currentApp } = await readBody(req);
      const backup = (state.skillBackups || []).find((item) => item.backupId === backupId);
      if (!backup) throw new Error(`Skill backup not found: ${backupId}`);
      const restored = {
        ...backup.skill,
        apps: {
          ...backup.skill.apps,
          [currentApp]: true,
        },
        updatedAt: Date.now(),
      };
      state.skills[restored.id] = restored;
      await syncSkillEverywhere(restored);
      await saveState(state);
      return sendJson(res, 200, restored);
    }
    if (parts[2] === "delete-backup" && req.method === "POST") {
      const { backupId } = await readBody(req);
      state.skillBackups = (state.skillBackups || []).filter(
        (item) => item.backupId !== backupId,
      );
      await saveState(state);
      return sendJson(res, 200, true);
    }
    if (parts[2] === "restore-backup" && req.method === "POST") {
      throw new Error("Skill backup restore is not implemented in web mode");
    }
    if (parts[2] === "scan-unmanaged" && req.method === "GET") {
      const grouped = new Map();
      for (const app of APPS) {
        const items = await scanSkillsFromAppDir(app);
        for (const item of items) {
          const existing = grouped.get(item.directory);
          if (existing) {
            existing.foundIn = [...new Set([...existing.foundIn, ...item.foundIn])];
          } else {
            grouped.set(item.directory, item);
          }
        }
      }
      return sendJson(res, 200, Array.from(grouped.values()));
    }
    if (parts[2] === "import-from-apps" && req.method === "POST") {
      const { imports } = await readBody(req);
      const installed = [];
      for (const item of imports || []) {
        const source = APPS.map((app) => ({
          app,
          path: join(skillTargetDir(app), item.directory),
        })).find(({ path }) => existsSync(path));
        if (!source) continue;
        const destinationDir = join(DATA_DIR, "skills", item.directory);
        await rm(destinationDir, { recursive: true, force: true });
        await ensureDir(dirname(destinationDir));
        await cp(source.path, destinationDir, { recursive: true });
        const skill = {
          id: item.directory,
          name: item.directory,
          description: "Imported from app skills directory",
          directory: destinationDir,
          apps: item.apps,
          installedAt: Date.now(),
          updatedAt: Date.now(),
        };
        state.skills[skill.id] = skill;
        await syncSkillEverywhere(skill);
        installed.push(skill);
      }
      await saveState(state);
      return sendJson(res, 200, installed);
    }
    if (parts[2] === "discover" && req.method === "GET") {
      const repos = state.skillRepos || [];
      const items = repos.map((repo) => ({
        key: `${repo.owner}/${repo.name}:${repo.branch || "main"}`,
        name: repo.name,
        description: `Repository ${repo.owner}/${repo.name}`,
        directory: repo.name,
        readmeUrl: `https://github.com/${repo.owner}/${repo.name}/blob/${repo.branch || "main"}/README.md`,
        repoOwner: repo.owner,
        repoName: repo.name,
        repoBranch: repo.branch || "main",
      }));
      return sendJson(res, 200, items);
    }
    if (parts[2] === "check-updates" && req.method === "GET") {
      const updates = Object.values(state.skills || [])
        .filter((skill) => skill.repoOwner && skill.repoName)
        .map((skill) => ({
          id: skill.id,
          name: skill.name,
          currentHash: skill.contentHash || "",
          remoteHash: `remote-${skill.id}`,
        }));
      return sendJson(res, 200, updates);
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

  if (parts[0] === "api" && parts[1] === "prompts") {
    const app = parts[2];
    assertApp(app);

    if (parts.length === 3 && req.method === "GET") {
      return sendJson(res, 200, state.prompts[app] || {});
    }

    if (parts.length === 4 && parts[3] === "current-file-content" && req.method === "GET") {
      const prompts = state.prompts[app] || {};
      const enabled = Object.values(prompts).find((prompt) => prompt.enabled);
      return sendJson(res, 200, enabled?.content || null);
    }

    if (parts.length === 4 && parts[3] === "import" && req.method === "POST") {
      const { fileName, content } = await readBody(req);
      const id = `prompt-${Date.now()}`;
      const name = String(fileName || "Imported Prompt").replace(/\.[^.]+$/, "");
      state.prompts[app][id] = {
        id,
        name,
        content: String(content || ""),
        enabled: false,
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
      };
      await saveState(state);
      return sendJson(res, 200, id);
    }

    const id = decodeURIComponent(parts[3] || "");
    if (parts.length === 4 && req.method === "PUT") {
      const { prompt } = await readBody(req);
      if (!prompt?.id) throw new Error("prompt.id is required");
      state.prompts[app][id] = prompt;
      if (prompt.enabled) {
        await syncEnabledPromptToFile(state, app);
      }
      await saveState(state);
      return sendJson(res, 200, true);
    }

    if (parts.length === 4 && req.method === "DELETE") {
      delete state.prompts[app][id];
      await syncEnabledPromptToFile(state, app);
      await saveState(state);
      return sendJson(res, 200, true);
    }

    if (parts.length === 5 && parts[4] === "enable" && req.method === "POST") {
      await backfillPromptFromLive(state, app);
      Object.keys(state.prompts[app] || {}).forEach((key) => {
        state.prompts[app][key].enabled = key === id;
      });
      await syncEnabledPromptToFile(state, app);
      await saveState(state);
      return sendJson(res, 200, true);
    }
  }

  if (parts[0] === "api" && parts[1] === "openclaw") {
    const path = openclawConfigPath();
    const config = await readJsonFileOr(path, {});
    const defaults = config?.agents?.defaults ?? null;

    if (parts[2] === "default-model" && req.method === "GET") {
      return sendJson(res, 200, defaults?.model ?? null);
    }
    if (parts[2] === "agents-defaults" && req.method === "GET") {
      return sendJson(res, 200, defaults);
    }
    if (parts[2] === "agents-defaults" && req.method === "PUT") {
      const { defaults: nextDefaults } = await readBody(req);
      config.agents = config.agents || {};
      config.agents.defaults = nextDefaults;
      await writeJsonAtomic(path, config);
      return sendJson(res, 200, { warnings: [] });
    }
    if (parts[2] === "env" && req.method === "GET") {
      return sendJson(res, 200, config.env || {});
    }
    if (parts[2] === "env" && req.method === "PUT") {
      const { env } = await readBody(req);
      config.env = env;
      await writeJsonAtomic(path, config);
      return sendJson(res, 200, { warnings: [] });
    }
    if (parts[2] === "tools" && req.method === "GET") {
      return sendJson(res, 200, config.tools || {});
    }
    if (parts[2] === "tools" && req.method === "PUT") {
      const { tools } = await readBody(req);
      config.tools = tools;
      await writeJsonAtomic(path, config);
      return sendJson(res, 200, { warnings: [] });
    }
    if (parts[2] === "model-catalog" && req.method === "GET") {
      return sendJson(res, 200, defaults?.models || null);
    }
    if (parts[2] === "model-catalog" && req.method === "PUT") {
      const { catalog } = await readBody(req);
      config.agents = config.agents || {};
      config.agents.defaults = config.agents.defaults || {};
      config.agents.defaults.models = catalog;
      await writeJsonAtomic(path, config);
      return sendJson(res, 200, { warnings: [] });
    }
    if (parts[2] === "health" && req.method === "GET") {
      return sendJson(res, 200, []);
    }
    if (parts[2] === "live-provider" && req.method === "GET") {
      return sendJson(res, 200, config);
    }
  }

  if (parts[0] === "api" && parts[1] === "hermes") {
    const path = hermesConfigPath();
    const config = await readHermesYamlOr(path, {});
    const memoryLimits = {
      memory: config.memory?.budgets?.memory ?? 2200,
      user: config.memory?.budgets?.user ?? 1375,
      memoryEnabled: config.memory?.enabled?.memory ?? true,
      userEnabled: config.memory?.enabled?.user ?? true,
    };

    if (parts[2] === "model-config" && req.method === "GET") {
      return sendJson(res, 200, config.model ?? null);
    }
    if (parts[2] === "memory-limits" && req.method === "GET") {
      return sendJson(res, 200, memoryLimits);
    }
    if (parts[2] === "memory" && parts[3] && req.method === "GET") {
      const kind = parts[3];
      const filePath = hermesMemoryPath(kind);
      const content = existsSync(filePath) ? await readFile(filePath, "utf8") : "";
      return sendJson(res, 200, content);
    }
    if (parts[2] === "memory" && parts[3] && req.method === "PUT") {
      const kind = parts[3];
      const { content } = await readBody(req);
      await writeTextAtomic(hermesMemoryPath(kind), String(content || ""));
      return sendJson(res, 200, true);
    }
    if (parts[2] === "memory-enabled" && parts[3] && req.method === "PUT") {
      const kind = parts[3];
      const { enabled } = await readBody(req);
      config.memory = config.memory || {};
      config.memory.enabled = config.memory.enabled || {};
      config.memory.enabled[kind] = Boolean(enabled);
      await writeTextAtomic(path, YAML.stringify(config));
      return sendJson(res, 200, true);
    }
  }

  if (parts[0] === "api" && parts[1] === "omo") {
    const variant = parts[2] === "slim" ? "omo-slim" : "omo";
    if (parts[3] === "local-file" && req.method === "GET") {
      return sendJson(res, 200, await readOmoLocalFile(variant));
    }
    if (parts[3] === "current-provider-id" && req.method === "GET") {
      const current = Object.values(state.providers.opencode || {}).find(
        (provider) => provider.category === variant && state.current.opencode === provider.id,
      );
      return sendJson(res, 200, current?.id || "");
    }
    if (parts[3] === "disable-current" && req.method === "POST") {
      for (const [id, provider] of Object.entries(state.providers.opencode || {})) {
        if (provider.category === variant && state.current.opencode === id) {
          state.current.opencode = "";
        }
      }
      for (const path of omoConfigPathCandidates(variant)) {
        await rm(path, { force: true });
      }
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
