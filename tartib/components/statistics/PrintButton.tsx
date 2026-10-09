"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

/** Открывает окно печати браузера: оттуда отчёт можно отправить на принтер или сохранить как PDF. */
export function PrintButton() {
  const { t } = useI18n();
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer className="h-4 w-4" aria-hidden /> {t("report.print")}
    </Button>
  );
}
