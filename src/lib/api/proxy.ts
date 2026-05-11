import { invoke } from "@tauri-apps/api/core";
import type {
  ProxyConfig,
  ProxyStatus,
  ProxyServerInfo,
  ProxyTakeoverStatus,
  GlobalProxyConfig,
  AppProxyConfig,
} from "@/types/proxy";
import { isTauriRuntime } from "./http";

const EMPTY_STATUS: ProxyStatus = {
  running: false,
  address: "127.0.0.1",
  port: 0,
  active_connections: 0,
  total_requests: 0,
  success_requests: 0,
  failed_requests: 0,
  success_rate: 0,
  uptime_seconds: 0,
  current_provider: null,
  current_provider_id: null,
  last_request_at: null,
  last_error: null,
  failover_count: 0,
};

const EMPTY_TAKEOVER: ProxyTakeoverStatus = {
  claude: false,
  codex: false,
  gemini: false,
  opencode: false,
  openclaw: false,
  hermes: false,
};

export const proxyApi = {
  // ========== 代理服务器控制 API ==========

  // 启动代理服务器
  async startProxyServer(): Promise<ProxyServerInfo> {
    if (!isTauriRuntime()) throw new Error("Proxy is not available in web mode");
    return invoke("start_proxy_server");
  },

  // 停止代理服务器并恢复配置
  async stopProxyWithRestore(): Promise<void> {
    if (!isTauriRuntime()) return;
    return invoke("stop_proxy_with_restore");
  },

  // 获取代理服务器状态
  async getProxyStatus(): Promise<ProxyStatus> {
    if (!isTauriRuntime()) return EMPTY_STATUS;
    return invoke("get_proxy_status");
  },

  // 检查代理服务器是否正在运行
  async isProxyRunning(): Promise<boolean> {
    if (!isTauriRuntime()) return false;
    return invoke("is_proxy_running");
  },

  // 检查是否处于接管模式
  async isLiveTakeoverActive(): Promise<boolean> {
    if (!isTauriRuntime()) return false;
    return invoke("is_live_takeover_active");
  },

  // 代理模式下切换供应商
  async switchProxyProvider(
    appType: string,
    providerId: string,
  ): Promise<void> {
    if (!isTauriRuntime()) throw new Error("Proxy is not available in web mode");
    return invoke("switch_proxy_provider", { appType, providerId });
  },

  // ========== 接管状态 API ==========

  // 获取各应用接管状态
  async getProxyTakeoverStatus(): Promise<ProxyTakeoverStatus> {
    if (!isTauriRuntime()) return EMPTY_TAKEOVER;
    return invoke("get_proxy_takeover_status");
  },

  // 为指定应用开启/关闭接管
  async setProxyTakeoverForApp(
    appType: string,
    enabled: boolean,
  ): Promise<void> {
    if (!isTauriRuntime()) return;
    return invoke("set_proxy_takeover_for_app", { appType, enabled });
  },

  // ========== Legacy 代理配置 API (兼容) ==========

  // 获取代理配置（旧版 v2 兼容接口）
  async getProxyConfig(): Promise<ProxyConfig> {
    if (!isTauriRuntime()) {
      return {
        listen_address: "127.0.0.1",
        listen_port: 0,
        max_retries: 0,
        request_timeout: 0,
        enable_logging: false,
        streaming_first_byte_timeout: 0,
        streaming_idle_timeout: 0,
        non_streaming_timeout: 0,
      };
    }
    return invoke("get_proxy_config");
  },

  // 更新代理配置（旧版 v2 兼容接口）
  async updateProxyConfig(config: ProxyConfig): Promise<void> {
    if (!isTauriRuntime()) return;
    return invoke("update_proxy_config", { config });
  },

  // ========== v3+ 全局/应用级配置 API ==========

  // 获取全局代理配置
  async getGlobalProxyConfig(): Promise<GlobalProxyConfig> {
    if (!isTauriRuntime()) {
      return { proxyEnabled: false, listenAddress: "127.0.0.1", listenPort: 0, enableLogging: false };
    }
    return invoke("get_global_proxy_config");
  },

  // 更新全局代理配置
  async updateGlobalProxyConfig(config: GlobalProxyConfig): Promise<void> {
    if (!isTauriRuntime()) return;
    return invoke("update_global_proxy_config", { config });
  },

  // 获取指定应用的代理配置
  async getProxyConfigForApp(appType: string): Promise<AppProxyConfig> {
    if (!isTauriRuntime()) {
      return {
        appType,
        enabled: false,
        autoFailoverEnabled: false,
        maxRetries: 0,
        streamingFirstByteTimeout: 0,
        streamingIdleTimeout: 0,
        nonStreamingTimeout: 0,
        circuitFailureThreshold: 0,
        circuitSuccessThreshold: 0,
        circuitTimeoutSeconds: 0,
        circuitErrorRateThreshold: 0,
        circuitMinRequests: 0,
      };
    }
    return invoke("get_proxy_config_for_app", { appType });
  },

  // 更新指定应用的代理配置
  async updateProxyConfigForApp(config: AppProxyConfig): Promise<void> {
    if (!isTauriRuntime()) return;
    return invoke("update_proxy_config_for_app", { config });
  },

  // ========== 计费默认配置 API ==========

  // 获取默认成本倍率
  async getDefaultCostMultiplier(appType: string): Promise<string> {
    if (!isTauriRuntime()) return "1";
    return invoke("get_default_cost_multiplier", { appType });
  },

  // 设置默认成本倍率
  async setDefaultCostMultiplier(
    appType: string,
    value: string,
  ): Promise<void> {
    if (!isTauriRuntime()) return;
    return invoke("set_default_cost_multiplier", { appType, value });
  },

  // 获取计费模式来源
  async getPricingModelSource(appType: string): Promise<string> {
    if (!isTauriRuntime()) return "response";
    return invoke("get_pricing_model_source", { appType });
  },

  // 设置计费模式来源
  async setPricingModelSource(appType: string, value: string): Promise<void> {
    if (!isTauriRuntime()) return;
    return invoke("set_pricing_model_source", { appType, value });
  },
};
