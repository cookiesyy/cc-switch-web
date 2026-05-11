import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getWebAuthToken, isTauriRuntime, setWebAuthToken } from "@/lib/api/http";

export function WebAuthTokenSettings() {
  const { t } = useTranslation();
  const [value, setValue] = useState(getWebAuthToken() || "");

  if (isTauriRuntime()) return null;

  return (
    <section className="space-y-3 rounded-lg border border-border bg-muted/40 p-6">
      <div>
        <h3 className="text-sm font-medium">
          {t("settings.webAuthToken.title", { defaultValue: "Web API Token" })}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("settings.webAuthToken.description", {
            defaultValue:
              "Set the Bearer token used by the browser when the backend is protected by CC_SWITCH_WEB_AUTH_TOKEN.",
          })}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="web-auth-token">
          {t("settings.webAuthToken.label", { defaultValue: "Bearer Token" })}
        </Label>
        <Input
          id="web-auth-token"
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="change-me"
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          onClick={() => setWebAuthToken(value)}
          variant="default"
        >
          {t("common.save")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setValue("");
            setWebAuthToken("");
          }}
        >
          {t("common.clear", { defaultValue: "Clear" })}
        </Button>
      </div>
    </section>
  );
}
