import { getTranslator } from "@/lib/i18n/server";
import { cn } from "@/lib/cn";

/** Обязательное пояснение: Tartib не даёт советов и не обещает прибыль. */
export async function Disclaimer({ className }: { className?: string }) {
  const { t } = await getTranslator();
  return <p className={cn("text-xs leading-relaxed text-muted", className)}>{t("common.disclaimer")}</p>;
}
