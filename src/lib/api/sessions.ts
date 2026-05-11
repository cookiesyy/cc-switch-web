import { invoke } from "@tauri-apps/api/core";
import type { SessionMessage, SessionMeta } from "@/types";
import { apiRequest, isTauriRuntime } from "./http";

export interface DeleteSessionOptions {
  providerId: string;
  sessionId: string;
  sourcePath: string;
}

export interface DeleteSessionResult extends DeleteSessionOptions {
  success: boolean;
  error?: string;
}

export const sessionsApi = {
  async upsert(meta: SessionMeta, messages: SessionMessage[]): Promise<boolean> {
    if (!isTauriRuntime()) {
      return apiRequest("/api/sessions/upsert", {
        method: "POST",
        body: JSON.stringify({ meta, messages }),
      });
    }
    return true;
  },
  async list(): Promise<SessionMeta[]> {
    if (!isTauriRuntime()) return apiRequest("/api/sessions/list");
    return await invoke("list_sessions");
  },

  async getMessages(
    providerId: string,
    sourcePath: string,
  ): Promise<SessionMessage[]> {
    if (!isTauriRuntime()) {
      return apiRequest("/api/sessions/messages", {
        method: "POST",
        body: JSON.stringify({ providerId, sourcePath }),
      });
    }
    return await invoke("get_session_messages", { providerId, sourcePath });
  },

  async delete(options: DeleteSessionOptions): Promise<boolean> {
    if (!isTauriRuntime()) {
      return apiRequest("/api/sessions/delete", {
        method: "POST",
        body: JSON.stringify(options),
      });
    }
    const { providerId, sessionId, sourcePath } = options;
    return await invoke("delete_session", {
      providerId,
      sessionId,
      sourcePath,
    });
  },

  async deleteMany(
    items: DeleteSessionOptions[],
  ): Promise<DeleteSessionResult[]> {
    if (!isTauriRuntime()) {
      return apiRequest("/api/sessions/delete-many", {
        method: "POST",
        body: JSON.stringify({ items }),
      });
    }
    return await invoke("delete_sessions", { items });
  },

  async launchTerminal(options: {
    command: string;
    cwd?: string | null;
    customConfig?: string | null;
  }): Promise<boolean> {
    if (!isTauriRuntime()) return false;
    const { command, cwd, customConfig } = options;
    return await invoke("launch_session_terminal", {
      command,
      cwd,
      customConfig,
    });
  },
};
