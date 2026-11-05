import Link from "next/link";
import { Card } from "@/components/ui";
import { getTranslator } from "@/lib/i18n/server";
import { isHorizon, isTraderMarket, shortcutsFor } from "@/lib/trader-profile";

/** «Мои инструменты»: ярлыки по профилю трейдера. Без профиля показывает приглашение его заполнить. */
export async function MyToolsCard({ horizon, markets }: { horizon: string | null; markets: string[] | null }) {
  const { t } = await getTranslator();
  const h = isHorizon(horizon) ? horizon : null;
  const ms = (markets ?? []).filter(isTraderMarket);
  const list = shortcutsFor(h, ms);
  if (list.length === 0) {
    return (
      <Link href="/settings#trader-profile" className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-dashed border-border px-4 text-sm text-muted hover:text-foreground">
        <span>{t("mytools.empty")}</span>
        <span className="font-medium text-primary">{t("mytools.set")} →</span>
      </Link>
    );
  }
  return (
    <Card className="space-y-3 p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{t("mytools.title")}</h2>
        <Link href="/settings#trader-profile" className="text-xs text-muted hover:text-foreground">{t("mytools.change")}</Link>
      </div>
      <ul className="flex flex-wrap gap-2">
        {list.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="inline-flex min-h-11 items-center rounded-xl border border-border px-3 text-sm hover:border-primary hover:text-primary">{t(`mytools.links.${s.key}`)}</Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
