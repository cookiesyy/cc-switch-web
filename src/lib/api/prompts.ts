import { invoke } from "@tauri-apps/api/core";
import type { AppId } from "./types";
import { apiRequest, isTauriRuntime } from "./http";

export interface Prompt {
  id: string;
  name: string;
  content: string;
  description?: string;
  enabled: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export const promptsApi = {
  async getPrompts(app: AppId): Promise<Record<string, Prompt>> {
    if (!isTauriRuntime()) {
      return await apiRequest(`/api/prompts/${app}`);
    }
    return await invoke("get_prompts", { app });
  },

  async upsertPrompt(app: AppId, id: string, prompt: Prompt): Promise<void> {
    if (!isTauriRuntime()) {
      await apiRequest(`/api/prompts/${app}/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify({ prompt }),
      });
      return;
    }
    return await invoke("upsert_prompt", { app, id, prompt });
  },

  async deletePrompt(app: AppId, id: string): Promise<void> {
    if (!isTauriRuntime()) {
      await apiRequest(`/api/prompts/${app}/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      return;
    }
    return await invoke("delete_prompt", { app, id });
  },

  async enablePrompt(app: AppId, id: string): Promise<void> {
    if (!isTauriRuntime()) {
      await apiRequest(`/api/prompts/${app}/${encodeURIComponent(id)}/enable`, {
        method: "POST",
      });
      return;
    }
    return await invoke("enable_prompt", { app, id });
  },

  async importFromFile(app: AppId): Promise<string> {
    if (!isTauriRuntime()) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".md,.txt,text/markdown,text/plain";
      return await new Promise<string>((resolve, reject) => {
        input.onchange = async () => {
          try {
            const file = input.files?.[0];
            if (!file) return reject(new Error("No file selected"));
            const content = await file.text();
            const id = await apiRequest(`/api/prompts/${app}/import`, {
              method: "POST",
              body: JSON.stringify({
                fileName: file.name,
                content,
              }),
            });
            resolve(id as string);
          } catch (error) {
            reject(error);
          }
        };
        input.click();
      });
    }
    return await invoke("import_prompt_from_file", { app });
  },

  async getCurrentFileContent(app: AppId): Promise<string | null> {
    if (!isTauriRuntime()) {
      return await apiRequest(`/api/prompts/${app}/current-file-content`);
    }
    return await invoke("get_current_prompt_file_content", { app });
  },
};
