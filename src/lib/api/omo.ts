import { invoke } from "@tauri-apps/api/core";
import type { OmoLocalFileData } from "@/types/omo";
import { apiRequest, isTauriRuntime } from "./http";

export const omoApi = {
  readLocalFile: (): Promise<OmoLocalFileData> =>
    isTauriRuntime()
      ? invoke("read_omo_local_file")
      : apiRequest("/api/omo/standard/local-file"),
  getCurrentOmoProviderId: (): Promise<string> =>
    isTauriRuntime()
      ? invoke("get_current_omo_provider_id")
      : apiRequest("/api/omo/standard/current-provider-id"),
  disableCurrentOmo: (): Promise<void> =>
    isTauriRuntime()
      ? invoke("disable_current_omo")
      : apiRequest("/api/omo/standard/disable-current", { method: "POST" }),
};

export const omoSlimApi = {
  readLocalFile: (): Promise<OmoLocalFileData> =>
    isTauriRuntime()
      ? invoke("read_omo_slim_local_file")
      : apiRequest("/api/omo/slim/local-file"),
  getCurrentProviderId: (): Promise<string> =>
    isTauriRuntime()
      ? invoke("get_current_omo_slim_provider_id")
      : apiRequest("/api/omo/slim/current-provider-id"),
  disableCurrent: (): Promise<void> =>
    isTauriRuntime()
      ? invoke("disable_current_omo_slim")
      : apiRequest("/api/omo/slim/disable-current", { method: "POST" }),
};
