import Link from "next/link";
import { Check } from "lucide-react";
import { Badge, Button, buttonStyles, Card } from "@/components/ui";
import { getTranslator } from "@/lib/i18n/server";

/** Два тарифа. Кнопка PRO пока неактивна: оплата будет подключена позже (Stripe или другой сервис). */
export async function PricingCards() {
  const { t, list } = await getTranslator();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="flex flex-col">
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

      <Card className="flex flex-col">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-muted">{t("pricing.pro.name")}</p>
          <Badge tone="primary">{t("common.soon")}</Badge>
        </div>
        <p className="mt-2 text-4xl font-bold">{t("pricing.pro.price")}</p>
        <ul className="mt-6 flex-1 space-y-3 text-sm">
          {list("pricing.pro.features").map((f) => (
            <li key={f} className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              {f}
            </li>
          ))}
        </ul>
        <Button variant="secondary" disabled className="mt-8">
          {t("pricing.pro.cta")}
        </Button>
      </Card>
    </div>
  );
}
