import { invoke } from "@tauri-apps/api/core";
import type { SubscriptionQuota } from "@/types/subscription";
import { isTauriRuntime } from "./http";

function emptyQuota(tool: string): SubscriptionQuota {
  return {
    tool,
    credentialStatus: "not_found",
    credentialMessage: "Not available in web mode",
    success: false,
    tiers: [],
    extraUsage: null,
    error: "Not available in web mode",
    queriedAt: Date.now(),
  };
}

export const subscriptionApi = {
  getQuota: (tool: string): Promise<SubscriptionQuota> =>
    isTauriRuntime()
      ? invoke("get_subscription_quota", { tool })
      : Promise.resolve(emptyQuota(tool)),
  getCodexOauthQuota: (accountId: string | null): Promise<SubscriptionQuota> =>
    isTauriRuntime()
      ? invoke("get_codex_oauth_quota", { accountId })
      : Promise.resolve(emptyQuota("codex")),
  getCodingPlanQuota: (
    baseUrl: string,
    apiKey: string,
  ): Promise<SubscriptionQuota> =>
    isTauriRuntime()
      ? invoke("get_coding_plan_quota", { baseUrl, apiKey })
      : Promise.resolve(emptyQuota("coding-plan")),
  getBalance: (
    baseUrl: string,
    apiKey: string,
  ): Promise<import("@/types").UsageResult> =>
    isTauriRuntime()
      ? invoke("get_balance", { baseUrl, apiKey })
      : Promise.resolve({ success: false, error: "Not available in web mode" }),
};
