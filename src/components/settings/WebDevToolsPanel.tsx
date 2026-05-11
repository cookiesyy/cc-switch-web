import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { isTauriRuntime } from "@/lib/api/http";

export function WebDevToolsPanel() {
  const { t } = useTranslation();
  if (isTauriRuntime()) return null;

  const seedUsage = async () => {
    try {
      await fetch("/api/usage/seed-demo", { method: "POST" });
      toast.success("Demo usage log inserted");
    } catch (error) {
      toast.error(String(error));
    }
  };

  const seedSession = async () => {
    try {
      await fetch("/api/sessions/seed-demo", { method: "POST" });
      toast.success("Demo session inserted");
    } catch (error) {
      toast.error(String(error));
    }
  };

  return (
    <section className="space-y-3 rounded-lg border border-border bg-muted/40 p-6">
      <div>
        <h3 className="text-sm font-medium">
          {t("settings.webDevTools.title", { defaultValue: "Web Dev Tools" })}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("settings.webDevTools.description", {
            defaultValue:
              "Insert demo data for usage and session pages so you can verify the full UI flow in web mode.",
          })}
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={seedUsage}>
          Seed Usage
        </Button>
        <Button type="button" variant="outline" onClick={seedSession}>
          Seed Session
        </Button>
      </div>
    </section>
  );
}
