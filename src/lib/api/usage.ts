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

export const usageApi = {
  // Provider usage script methods
  query: async (providerId: string, appId: AppId): Promise<UsageResult> => {
    if (!isTauriRuntime()) {
      return { success: false, error: "Usage is not available in web mode" };
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
      return {
        totalRequests: 0,
        totalCost: "0",
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheCreationTokens: 0,
        totalCacheReadTokens: 0,
        successRate: 0,
      } as UsageSummary;
    }
    return invoke("get_usage_summary", { startDate, endDate, appType });
  },

  getUsageTrends: async (
    startDate?: number,
    endDate?: number,
    appType?: string,
  ): Promise<DailyStats[]> => {
    if (!isTauriRuntime()) return [];
    return invoke("get_usage_trends", { startDate, endDate, appType });
  },

  getProviderStats: async (
    startDate?: number,
    endDate?: number,
    appType?: string,
  ): Promise<ProviderStats[]> => {
    if (!isTauriRuntime()) return [];
    return invoke("get_provider_stats", { startDate, endDate, appType });
  },

  getModelStats: async (
    startDate?: number,
    endDate?: number,
    appType?: string,
  ): Promise<ModelStats[]> => {
    if (!isTauriRuntime()) return [];
    return invoke("get_model_stats", { startDate, endDate, appType });
  },

  getRequestLogs: async (
    filters: LogFilters,
    page: number = 0,
    pageSize: number = 20,
  ): Promise<PaginatedLogs> => {
    if (!isTauriRuntime()) {
      return { data: [], total: 0, page, pageSize } as PaginatedLogs;
    }
    return invoke("get_request_logs", {
      filters,
      page,
      pageSize,
    });
  },

  getRequestDetail: async (requestId: string): Promise<RequestLog | null> => {
    if (!isTauriRuntime()) return null;
    return invoke("get_request_detail", { requestId });
  },

  getModelPricing: async (): Promise<ModelPricing[]> => {
    if (!isTauriRuntime()) return [];
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
    if (!isTauriRuntime()) return;
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
    if (!isTauriRuntime()) return;
    return invoke("delete_model_pricing", { modelId });
  },

  checkProviderLimits: async (
    providerId: string,
    appType: string,
  ): Promise<ProviderLimitStatus> => {
    if (!isTauriRuntime()) {
      return {
        providerId,
        dailyUsage: "0",
        dailyExceeded: false,
        monthlyUsage: "0",
        monthlyExceeded: false,
      } as ProviderLimitStatus;
    }
    return invoke("check_provider_limits", { providerId, appType });
  },

  // Session usage sync
  syncSessionUsage: async (): Promise<SessionSyncResult> => {
    if (!isTauriRuntime()) {
      return { imported: 0, skipped: 0, filesScanned: 0, errors: [] } as SessionSyncResult;
    }
    return invoke("sync_session_usage");
  },

  getDataSourceBreakdown: async (): Promise<DataSourceSummary[]> => {
    if (!isTauriRuntime()) return [];
    return invoke("get_usage_data_sources");
  },
};
