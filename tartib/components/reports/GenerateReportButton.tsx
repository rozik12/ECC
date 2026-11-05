"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { generateWeeklyReportAction } from "@/app/actions/reports";
import { Alert, Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

export function GenerateReportButton({ hasReport }: { hasReport: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      {error && <Alert tone="danger" className="mb-3">{t(error)}</Alert>}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await generateWeeklyReportAction();
            if (!result.ok) return setError(result.error);
            router.refresh();
          });
        }}
      >
        <RefreshCw className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden />
        {hasReport ? t("reports.regenerate") : t("reports.generate")}
      </Button>
    </div>
  );
}
