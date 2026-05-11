import { invoke } from "@tauri-apps/api/core";
import type {
  UsageSummary,
  DailyStats,
  ProviderStats,
  ModelStats,
  RequestLog,
  LogFilters,
  ModelPricing,
  ProviderLimitStatus,
  PaginatedLogs,
  SessionSyncResult,
  DataSourceSummary,
} from "@/types/usage";
import type { UsageResult } from "@/types";
import type { AppId } from "./types";
import type { TemplateType } from "@/config/constants";
import { isTauriRuntime } from "./http";
import { apiRequest } from "./http";

export const usageApi = {
  upsertRequestLog: async (log: RequestLog): Promise<boolean> => {
    if (!isTauriRuntime()) {
      return apiRequest("/api/usage/request-log", {
        method: "POST",
        body: JSON.stringify(log),
      });
    }
    return true;
  },
  // Provider usage script methods
  query: async (providerId: string, appId: AppId): Promise<UsageResult> => {
    if (!isTauriRuntime()) {
      return apiRequest("/api/usage/query", {
        method: "POST",
        body: JSON.stringify({ providerId, appId }),
      });
    }
    return invoke("queryProviderUsage", { providerId, app: appId });
  },

  testScript: async (
    providerId: string,
    appId: AppId,
    scriptCode: string,
    timeout?: number,
    apiKey?: string,
    baseUrl?: string,
    accessToken?: string,
    userId?: string,
    templateType?: TemplateType,
  ): Promise<UsageResult> => {
    if (!isTauriRuntime()) {
      return { success: false, error: "Usage script testing is not available in web mode" };
    }
    return invoke("testUsageScript", {
      providerId,
      app: appId,
      scriptCode,
      timeout,
      apiKey,
      baseUrl,
      accessToken,
      userId,
      templateType,
    });
  },

  // Proxy usage statistics methods
  getUsageSummary: async (
    startDate?: number,
    endDate?: number,
    appType?: string,
  ): Promise<UsageSummary> => {
    if (!isTauriRuntime()) {
      const params = new URLSearchParams();
      if (startDate != null) params.set("startDate", String(startDate));
      if (endDate != null) params.set("endDate", String(endDate));
      if (appType) params.set("appType", appType);
      return apiRequest(`/api/usage/summary?${params.toString()}`);
    }
    return invoke("get_usage_summary", { startDate, endDate, appType });
  },

  getUsageTrends: async (
    startDate?: number,
    endDate?: number,
    appType?: string,
  ): Promise<DailyStats[]> => {
    if (!isTauriRuntime()) {
      const params = new URLSearchParams();
      if (startDate != null) params.set("startDate", String(startDate));
      if (endDate != null) params.set("endDate", String(endDate));
      if (appType) params.set("appType", appType);
      return apiRequest(`/api/usage/trends?${params.toString()}`);
    }
    return invoke("get_usage_trends", { startDate, endDate, appType });
  },

  getProviderStats: async (
    startDate?: number,
    endDate?: number,
    appType?: string,
  ): Promise<ProviderStats[]> => {
    if (!isTauriRuntime()) {
      const params = new URLSearchParams();
      if (startDate != null) params.set("startDate", String(startDate));
      if (endDate != null) params.set("endDate", String(endDate));
      if (appType) params.set("appType", appType);
      return apiRequest(`/api/usage/provider-stats?${params.toString()}`);
    }
    return invoke("get_provider_stats", { startDate, endDate, appType });
  },

  getModelStats: async (
    startDate?: number,
    endDate?: number,
    appType?: string,
  ): Promise<ModelStats[]> => {
    if (!isTauriRuntime()) {
      const params = new URLSearchParams();
      if (startDate != null) params.set("startDate", String(startDate));
      if (endDate != null) params.set("endDate", String(endDate));
      if (appType) params.set("appType", appType);
      return apiRequest(`/api/usage/model-stats?${params.toString()}`);
    }
    return invoke("get_model_stats", { startDate, endDate, appType });
  },

  getRequestLogs: async (
    filters: LogFilters,
    page: number = 0,
    pageSize: number = 20,
  ): Promise<PaginatedLogs> => {
    if (!isTauriRuntime()) {
      return apiRequest("/api/usage/request-logs", {
        method: "POST",
        body: JSON.stringify({ filters, page, pageSize }),
      });
    }
    return invoke("get_request_logs", {
      filters,
      page,
      pageSize,
    });
  },

  getRequestDetail: async (requestId: string): Promise<RequestLog | null> => {
    if (!isTauriRuntime()) return apiRequest(`/api/usage/request-detail/${encodeURIComponent(requestId)}`);
    return invoke("get_request_detail", { requestId });
  },

  getModelPricing: async (): Promise<ModelPricing[]> => {
    if (!isTauriRuntime()) return apiRequest("/api/usage/model-pricing");
    return invoke("get_model_pricing");
  },

  updateModelPricing: async (
    modelId: string,
    displayName: string,
    inputCost: string,
    outputCost: string,
    cacheReadCost: string,
    cacheCreationCost: string,
  ): Promise<void> => {
    if (!isTauriRuntime()) {
      await apiRequest("/api/usage/model-pricing", {
        method: "POST",
        body: JSON.stringify({
          modelId,
          displayName,
          inputCostPerMillion: inputCost,
          outputCostPerMillion: outputCost,
          cacheReadCostPerMillion: cacheReadCost,
          cacheCreationCostPerMillion: cacheCreationCost,
        }),
      });
      return;
    }
    return invoke("update_model_pricing", {
      modelId,
      displayName,
      inputCost,
      outputCost,
      cacheReadCost,
      cacheCreationCost,
    });
  },

  deleteModelPricing: async (modelId: string): Promise<void> => {
    if (!isTauriRuntime()) {
      await apiRequest(`/api/usage/model-pricing/${encodeURIComponent(modelId)}`, {
        method: "DELETE",
      });
      return;
    }
    return invoke("delete_model_pricing", { modelId });
  },

  checkProviderLimits: async (
    providerId: string,
    appType: string,
  ): Promise<ProviderLimitStatus> => {
    if (!isTauriRuntime()) {
      const params = new URLSearchParams({ providerId, appType });
      return apiRequest(`/api/usage/provider-limit?${params.toString()}`);
    }
    return invoke("check_provider_limits", { providerId, appType });
  },

  // Session usage sync
  syncSessionUsage: async (): Promise<SessionSyncResult> => {
    if (!isTauriRuntime()) {
      return apiRequest("/api/usage/session-sync", { method: "POST" });
    }
    return invoke("sync_session_usage");
  },

  getDataSourceBreakdown: async (): Promise<DataSourceSummary[]> => {
    if (!isTauriRuntime()) return apiRequest("/api/usage/data-sources");
    return invoke("get_usage_data_sources");
  },
};
