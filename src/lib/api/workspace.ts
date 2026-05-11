import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./http";

export interface DailyMemoryFileInfo {
  filename: string;
  date: string;
  sizeBytes: number;
  modifiedAt: number;
  preview: string;
}

export interface DailyMemorySearchResult {
  filename: string;
  date: string;
  sizeBytes: number;
  modifiedAt: number;
  snippet: string;
  matchCount: number;
}

export const workspaceApi = {
  async readFile(filename: string): Promise<string | null> {
    if (!isTauriRuntime()) return null;
    return invoke<string | null>("read_workspace_file", { filename });
  },

  async writeFile(filename: string, content: string): Promise<void> {
    if (!isTauriRuntime()) return;
    return invoke<void>("write_workspace_file", { filename, content });
  },

  async listDailyMemoryFiles(): Promise<DailyMemoryFileInfo[]> {
    if (!isTauriRuntime()) return [];
    return invoke<DailyMemoryFileInfo[]>("list_daily_memory_files");
  },

  async readDailyMemoryFile(filename: string): Promise<string | null> {
    if (!isTauriRuntime()) return null;
    return invoke<string | null>("read_daily_memory_file", { filename });
  },

  async writeDailyMemoryFile(filename: string, content: string): Promise<void> {
    if (!isTauriRuntime()) return;
    return invoke<void>("write_daily_memory_file", { filename, content });
  },

  async deleteDailyMemoryFile(filename: string): Promise<void> {
    if (!isTauriRuntime()) return;
    return invoke<void>("delete_daily_memory_file", { filename });
  },

  async searchDailyMemoryFiles(
    query: string,
  ): Promise<DailyMemorySearchResult[]> {
    if (!isTauriRuntime()) return [];
    return invoke<DailyMemorySearchResult[]>("search_daily_memory_files", {
      query,
    });
  },

  async openDirectory(subdir: "workspace" | "memory"): Promise<void> {
    if (!isTauriRuntime()) return;
    await invoke("open_workspace_directory", { subdir });
  },
};
