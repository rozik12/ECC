"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

/** Понятное сообщение вместо технической ошибки. Подробности пишем только в консоль разработчика. */
export function ErrorState({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 py-10 text-center">
      <TriangleAlert className="h-8 w-8 text-warning" aria-hidden />
      <p className="text-lg font-semibold">{t("states.errorTitle")}</p>
      <p className="text-sm text-muted">{t("states.errorText")}</p>
      <Button onClick={reset} className="mt-2">{t("states.retry")}</Button>
    </Card>
  );
}
