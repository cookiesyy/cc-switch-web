import { useTranslation } from "react-i18next";
import { isTauriRuntime } from "@/lib/api/http";

export function WebModeNotice() {
  const { t } = useTranslation();
  if (isTauriRuntime()) return null;

  return (
    <section className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-6">
      <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300">
        {t("settings.webModeNotice.title", {
          defaultValue: "Web Mode Limitations",
        })}
      </h3>
      <p className="text-sm text-amber-700 dark:text-amber-400">
        {t("settings.webModeNotice.description", {
          defaultValue:
            "Some desktop-only features such as proxy takeover, native auth flows, session terminal launch, and detailed usage dashboards may be unavailable or partially implemented in web mode.",
        })}
      </p>
    </section>
  );
}
