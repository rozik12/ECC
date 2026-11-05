import { Construction } from "lucide-react";
import { Card } from "@/components/ui";
import { getTranslator } from "@/lib/i18n/server";

export async function ComingSoon({ titleKey }: { titleKey: string }) {
  const { t } = await getTranslator();
  return (
    <div>
      <h1 className="text-2xl font-bold sm:text-3xl">{t(titleKey)}</h1>
      <Card className="mt-6 flex flex-col items-center gap-3 py-12 text-center">
        <Construction className="h-8 w-8 text-muted" aria-hidden />
        <p className="font-semibold">{t("pages.comingTitle")}</p>
        <p className="text-sm text-muted">{t("pages.comingText")}</p>
      </Card>
    </div>
  );
}
