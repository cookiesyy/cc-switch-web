export const isTauriRuntime = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const getWebAuthToken = () =>
  typeof window !== "undefined"
    ? window.localStorage.getItem("cc-switch-web-auth-token")
    : null;

export const setWebAuthToken = (token: string) => {
  if (typeof window === "undefined") return;
  if (token.trim()) {
    window.localStorage.setItem("cc-switch-web-auth-token", token.trim());
  } else {
    window.localStorage.removeItem("cc-switch-web-auth-token");
  }
};

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getWebAuthToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Keep the HTTP status as the error message when response isn't JSON.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}
