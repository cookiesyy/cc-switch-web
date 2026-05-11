import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi, type ManagedAuthProvider } from "@/lib/api/auth";
import { copilotAddManualAccount } from "@/lib/api/copilot";
import { isTauriRuntime } from "@/lib/api/http";
import { toast } from "sonner";

interface ManualAuthAccountPanelProps {
  provider: ManagedAuthProvider;
}

export function ManualAuthAccountPanel({
  provider,
}: ManualAuthAccountPanelProps) {
  const { t } = useTranslation();
  const [id, setId] = useState("");
  const [login, setLogin] = useState("");

  if (isTauriRuntime()) return null;

  const submit = async () => {
    if (!id.trim() || !login.trim()) return;
    const account = {
      id: id.trim(),
      provider,
      login: login.trim(),
      avatar_url: null,
      authenticated_at: Math.floor(Date.now() / 1000),
      is_default: false,
      github_domain: "github.com",
    };
    try {
      if (provider === "github_copilot") {
        await copilotAddManualAccount(account);
      } else {
        await authApi.authAddManualAccount(provider, account);
      }
      setId("");
      setLogin("");
      toast.success("Manual account added");
    } catch (error) {
      toast.error(String(error));
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-dashed border-border p-4">
      <div className="text-sm font-medium">
        {t("settings.manualAuth.title", { defaultValue: "Manual Account Entry" })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Account ID</Label>
          <Input value={id} onChange={(e) => setId(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Login</Label>
          <Input value={login} onChange={(e) => setLogin(e.target.value)} />
        </div>
      </div>
      <Button type="button" variant="outline" onClick={submit}>
        Add Manual Account
      </Button>
    </div>
  );
}
