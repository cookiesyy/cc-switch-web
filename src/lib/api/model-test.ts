import { invoke } from "@tauri-apps/api/core";
import type { AppId } from "./types";
import { isTauriRuntime } from "./http";

// ===== 流式健康检查类型 =====

export type HealthStatus = "operational" | "degraded" | "failed";

export interface StreamCheckConfig {
  timeoutSecs: number;
  maxRetries: number;
  degradedThresholdMs: number;
  claudeModel: string;
  codexModel: string;
  geminiModel: string;
  testPrompt: string;
}

export interface StreamCheckResult {
  status: HealthStatus;
  success: boolean;
  message: string;
  responseTimeMs?: number;
  httpStatus?: number;
  modelUsed: string;
  testedAt: number;
  retryCount: number;
  /** 细粒度错误分类，如 "modelNotFound" */
  errorCategory?: string;
}

// ===== 流式健康检查 API =====

/**
 * 流式健康检查（单个供应商）
 */
export async function streamCheckProvider(
  appType: AppId,
  providerId: string,
): Promise<StreamCheckResult> {
  if (!isTauriRuntime()) {
    throw new Error("Stream check is not available in web mode");
  }
  return invoke("stream_check_provider", { appType, providerId });
}

/**
 * 批量流式健康检查
 */
export async function streamCheckAllProviders(
  appType: AppId,
  proxyTargetsOnly: boolean = false,
): Promise<Array<[string, StreamCheckResult]>> {
  if (!isTauriRuntime()) {
    return [];
  }
  return invoke("stream_check_all_providers", { appType, proxyTargetsOnly });
}

/**
 * 获取流式检查配置
 */
export async function getStreamCheckConfig(): Promise<StreamCheckConfig> {
  if (!isTauriRuntime()) {
    return {
      timeoutSecs: 8,
      maxRetries: 1,
      degradedThresholdMs: 3000,
      claudeModel: "",
      codexModel: "",
      geminiModel: "",
      testPrompt: "ping",
    };
  }
  return invoke("get_stream_check_config");
}

/**
 * 保存流式检查配置
 */
export async function saveStreamCheckConfig(
  config: StreamCheckConfig,
): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke("save_stream_check_config", { config });
}
