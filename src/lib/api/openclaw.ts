import { invoke } from "@tauri-apps/api/core";
import type {
  OpenClawDefaultModel,
  OpenClawModelCatalogEntry,
  OpenClawAgentsDefaults,
  OpenClawEnvConfig,
  OpenClawToolsConfig,
  OpenClawHealthWarning,
  OpenClawWriteOutcome,
} from "@/types";
import { apiRequest, isTauriRuntime } from "./http";

/**
 * OpenClaw configuration API
 *
 * Manages ~/.openclaw/openclaw.json sections:
 * - agents.defaults (model, catalog)
 * - env (environment variables)
 * - tools (permissions)
 */
export const openclawApi = {
  // ============================================================
  // Agents Configuration
  // ============================================================

  /**
   * Get default model configuration (agents.defaults.model)
   */
  async getDefaultModel(): Promise<OpenClawDefaultModel | null> {
    if (!isTauriRuntime()) {
      return await apiRequest("/api/openclaw/default-model");
    }
    return await invoke("get_openclaw_default_model");
  },

  /**
   * Set default model configuration (agents.defaults.model)
   */
  async setDefaultModel(
    model: OpenClawDefaultModel,
  ): Promise<OpenClawWriteOutcome> {
    if (!isTauriRuntime()) {
      return await apiRequest("/api/openclaw/agents-defaults", {
        method: "PUT",
        body: JSON.stringify({ defaults: { model } }),
      });
    }
    return await invoke("set_openclaw_default_model", { model });
  },

  /**
   * Get model catalog/allowlist (agents.defaults.models)
   */
  async getModelCatalog(): Promise<Record<
    string,
    OpenClawModelCatalogEntry
  > | null> {
    return await invoke("get_openclaw_model_catalog");
  },

  /**
   * Set model catalog/allowlist (agents.defaults.models)
   */
  async setModelCatalog(
    catalog: Record<string, OpenClawModelCatalogEntry>,
  ): Promise<OpenClawWriteOutcome> {
    return await invoke("set_openclaw_model_catalog", { catalog });
  },

  /**
   * Get full agents.defaults config (all fields)
   */
  async getAgentsDefaults(): Promise<OpenClawAgentsDefaults | null> {
    if (!isTauriRuntime()) {
      return await apiRequest("/api/openclaw/agents-defaults");
    }
    return await invoke("get_openclaw_agents_defaults");
  },

  /**
   * Set full agents.defaults config (all fields)
   */
  async setAgentsDefaults(
    defaults: OpenClawAgentsDefaults,
  ): Promise<OpenClawWriteOutcome> {
    if (!isTauriRuntime()) {
      return await apiRequest("/api/openclaw/agents-defaults", {
        method: "PUT",
        body: JSON.stringify({ defaults }),
      });
    }
    return await invoke("set_openclaw_agents_defaults", { defaults });
  },

  // ============================================================
  // Env Configuration
  // ============================================================

  /**
   * Get env config (env section of openclaw.json)
   */
  async getEnv(): Promise<OpenClawEnvConfig> {
    if (!isTauriRuntime()) {
      return await apiRequest("/api/openclaw/env");
    }
    return await invoke("get_openclaw_env");
  },

  /**
   * Set env config (env section of openclaw.json)
   */
  async setEnv(env: OpenClawEnvConfig): Promise<OpenClawWriteOutcome> {
    if (!isTauriRuntime()) {
      return await apiRequest("/api/openclaw/env", {
        method: "PUT",
        body: JSON.stringify({ env }),
      });
    }
    return await invoke("set_openclaw_env", { env });
  },

  // ============================================================
  // Tools Configuration
  // ============================================================

  /**
   * Get tools config (tools section of openclaw.json)
   */
  async getTools(): Promise<OpenClawToolsConfig> {
    if (!isTauriRuntime()) {
      return await apiRequest("/api/openclaw/tools");
    }
    return await invoke("get_openclaw_tools");
  },

  /**
   * Set tools config (tools section of openclaw.json)
   */
  async setTools(tools: OpenClawToolsConfig): Promise<OpenClawWriteOutcome> {
    if (!isTauriRuntime()) {
      return await apiRequest("/api/openclaw/tools", {
        method: "PUT",
        body: JSON.stringify({ tools }),
      });
    }
    return await invoke("set_openclaw_tools", { tools });
  },

  async scanHealth(): Promise<OpenClawHealthWarning[]> {
    if (!isTauriRuntime()) {
      return await apiRequest("/api/openclaw/health");
    }
    return await invoke("scan_openclaw_config_health");
  },

  async getLiveProvider(
    providerId: string,
  ): Promise<Record<string, unknown> | null> {
    if (!isTauriRuntime()) {
      return await apiRequest("/api/openclaw/live-provider");
    }
    return await invoke("get_openclaw_live_provider", { providerId });
  },
};
