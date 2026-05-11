import { invoke } from "@tauri-apps/api/core";
import type {
  HermesMemoryKind,
  HermesMemoryLimits,
  HermesModelConfig,
} from "@/types";
import { apiRequest, isTauriRuntime } from "./http";

/**
 * Hermes Agent configuration API (CC Switch side).
 *
 * CC Switch intentionally keeps its Hermes surface minimal — deep configuration
 * (model, agent behavior, env vars, skills, cron, logs, analytics) lives in
 * the Hermes Web UI at http://127.0.0.1:9119. CC Switch only reads the `model`
 * section to highlight the active provider and launches the Hermes Web UI for
 * everything else. Writes to `model` happen implicitly via
 * `apply_switch_defaults` when the user switches providers.
 */
export const hermesApi = {
  async getModelConfig(): Promise<HermesModelConfig | null> {
    if (!isTauriRuntime()) {
      return await apiRequest("/api/hermes/model-config");
    }
    return await invoke("get_hermes_model_config");
  },

  /**
   * Probe the local Hermes Web UI and open it in the system browser.
   * Optional `path` lets callers deep-link to specific pages like `/config`.
   */
  async openWebUI(path?: string): Promise<void> {
    if (!isTauriRuntime()) {
      const url = `http://127.0.0.1:9119${path ?? ""}`;
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    await invoke("open_hermes_web_ui", { path: path ?? null });
  },

  /** Open the preferred terminal and run `hermes dashboard` (non-blocking). */
  async launchDashboard(): Promise<void> {
    await invoke("launch_hermes_dashboard");
  },

  /**
   * Read one of Hermes' memory blobs (`MEMORY.md` or `USER.md`). Returns an
   * empty string when the file hasn't been created yet.
   */
  async getMemory(kind: HermesMemoryKind): Promise<string> {
    if (!isTauriRuntime()) {
      return await apiRequest(`/api/hermes/memory/${kind}`);
    }
    return await invoke("get_hermes_memory", { kind });
  },

  /** Atomically overwrite a Hermes memory file. */
  async setMemory(kind: HermesMemoryKind, content: string): Promise<void> {
    if (!isTauriRuntime()) {
      await apiRequest(`/api/hermes/memory/${kind}`, {
        method: "PUT",
        body: JSON.stringify({ content }),
      });
      return;
    }
    await invoke("set_hermes_memory", { kind, content });
  },

  /**
   * Character budgets + enable flags for both memory blobs, read from
   * config.yaml with Hermes defaults as fallback.
   */
  async getMemoryLimits(): Promise<HermesMemoryLimits> {
    if (!isTauriRuntime()) {
      return await apiRequest("/api/hermes/memory-limits");
    }
    return await invoke("get_hermes_memory_limits");
  },

  /**
   * Toggle the on/off flag for one memory blob. Other fields in the `memory:`
   * section (budgets, external provider config) are preserved.
   */
  async setMemoryEnabled(
    kind: HermesMemoryKind,
    enabled: boolean,
  ): Promise<void> {
    if (!isTauriRuntime()) {
      await apiRequest(`/api/hermes/memory-enabled/${kind}`, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      });
      return;
    }
    await invoke("set_hermes_memory_enabled", { kind, enabled });
  },
};
