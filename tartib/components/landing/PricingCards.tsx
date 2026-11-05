import Link from "next/link";
import { Check } from "lucide-react";
import { buttonStyles, Card } from "@/components/ui";
import { getTranslator } from "@/lib/i18n/server";

/** Платных тарифов нет: одна карточка «всё бесплатно». */
export async function PricingCards() {
  const { t, list } = await getTranslator();
  return (
    <Card className="mx-auto flex max-w-xl flex-col">
      <p className="text-sm font-semibold text-muted">{t("pricing.free.name")}</p>
      <p className="mt-2 text-4xl font-bold">
        {t("pricing.free.price")}{" "}
        <span className="text-base font-normal text-muted">{t("pricing.free.period")}</span>
      </p>
      <ul className="mt-6 flex-1 space-y-3 text-sm">
        {list("pricing.free.features").map((f) => (
          <li key={f} className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            {f}
          </li>
        ))}
      </ul>
      <Link href="/register" className={buttonStyles({ className: "mt-8" })}>
        {t("pricing.free.cta")}
      </Link>
    </Card>
  );
}
