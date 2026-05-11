/**
 * 代理配置管理 Hook
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { ProxyConfig } from "@/types/proxy";
import { isTauriRuntime } from "@/lib/api/http";

/**
 * 代理配置管理
 */
export function useProxyConfig() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // 查询配置
  const { data: config, isLoading } = useQuery({
    queryKey: ["proxyConfig"],
    queryFn: () =>
      isTauriRuntime()
        ? invoke<ProxyConfig>("get_proxy_config")
        : Promise.resolve({
            listen_address: "127.0.0.1",
            listen_port: 0,
            max_retries: 0,
            request_timeout: 0,
            enable_logging: false,
            streaming_first_byte_timeout: 0,
            streaming_idle_timeout: 0,
            non_streaming_timeout: 0,
          }),
  });

  // 更新配置
  const updateMutation = useMutation({
    mutationFn: (newConfig: ProxyConfig) =>
      isTauriRuntime()
        ? invoke("update_proxy_config", { config: newConfig })
        : Promise.resolve(),
    onSuccess: () => {
      toast.success(t("proxy.settings.toast.saved"), { closeButton: true });
      queryClient.invalidateQueries({ queryKey: ["proxyConfig"] });
      queryClient.invalidateQueries({ queryKey: ["proxyStatus"] });
    },
    onError: (error: Error) => {
      toast.error(
        t("proxy.settings.toast.saveFailed", {
          error: error.message,
        }),
      );
    },
  });

  return {
    config,
    isLoading,
    updateConfig: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}
