import { invoke } from "@tauri-apps/api/core";
import { apiRequest, isTauriRuntime } from "./http";

export type ManagedAuthProvider = "github_copilot" | "codex_oauth";

export interface ManagedAuthAccount {
  id: string;
  provider: ManagedAuthProvider;
  login: string;
  avatar_url: string | null;
  authenticated_at: number;
  is_default: boolean;
  github_domain: string;
}

export interface ManagedAuthStatus {
  provider: ManagedAuthProvider;
  authenticated: boolean;
  default_account_id: string | null;
  migration_error?: string | null;
  accounts: ManagedAuthAccount[];
}

export interface ManagedAuthDeviceCodeResponse {
  provider: ManagedAuthProvider;
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export async function authStartLogin(
  authProvider: ManagedAuthProvider,
  githubDomain?: string,
): Promise<ManagedAuthDeviceCodeResponse> {
  if (!isTauriRuntime()) throw new Error("Auth is not available in web mode");
  return invoke<ManagedAuthDeviceCodeResponse>("auth_start_login", {
    authProvider,
    githubDomain: githubDomain || null,
  });
}

export async function authPollForAccount(
  authProvider: ManagedAuthProvider,
  deviceCode: string,
  githubDomain?: string,
): Promise<ManagedAuthAccount | null> {
  if (!isTauriRuntime()) return null;
  return invoke<ManagedAuthAccount | null>("auth_poll_for_account", {
    authProvider,
    deviceCode,
    githubDomain: githubDomain || null,
  });
}

export async function authListAccounts(
  authProvider: ManagedAuthProvider,
): Promise<ManagedAuthAccount[]> {
  if (!isTauriRuntime()) {
    return apiRequest(`/api/auth/${authProvider}/accounts`);
  }
  return invoke<ManagedAuthAccount[]>("auth_list_accounts", {
    authProvider,
  });
}

export async function authGetStatus(
  authProvider: ManagedAuthProvider,
): Promise<ManagedAuthStatus> {
  if (!isTauriRuntime()) {
    return apiRequest(`/api/auth/${authProvider}/status`);
  }
  return invoke<ManagedAuthStatus>("auth_get_status", {
    authProvider,
  });
}

export async function authRemoveAccount(
  authProvider: ManagedAuthProvider,
  accountId: string,
): Promise<void> {
  if (!isTauriRuntime()) {
    await apiRequest(`/api/auth/${authProvider}/accounts/${encodeURIComponent(accountId)}`, {
      method: "DELETE",
    });
    return;
  }
  return invoke("auth_remove_account", {
    authProvider,
    accountId,
  });
}

export async function authSetDefaultAccount(
  authProvider: ManagedAuthProvider,
  accountId: string,
): Promise<void> {
  if (!isTauriRuntime()) {
    await apiRequest(`/api/auth/${authProvider}/default-account`, {
      method: "PUT",
      body: JSON.stringify({ accountId }),
    });
    return;
  }
  return invoke("auth_set_default_account", {
    authProvider,
    accountId,
  });
}

export async function authLogout(
  authProvider: ManagedAuthProvider,
): Promise<void> {
  if (!isTauriRuntime()) {
    await apiRequest(`/api/auth/${authProvider}/logout`, { method: "POST" });
    return;
  }
  return invoke("auth_logout", {
    authProvider,
  });
}

export const authApi = {
  authStartLogin,
  authPollForAccount,
  authListAccounts,
  authGetStatus,
  authRemoveAccount,
  authSetDefaultAccount,
  authLogout,
};
