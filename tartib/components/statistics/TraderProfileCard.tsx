import Link from "next/link";
import { Card } from "@/components/ui";
import { getTranslator } from "@/lib/i18n/server";
import { detectBehavior, detectMarket, detectStyle, MIN_TRADES_FOR_PROFILE } from "@/lib/trader-types";
import type { StatTrade } from "@/lib/statistics";

/** «Ваш профиль трейдера»: стиль, основной рынок и поведение, определённые по журналу. Только подсказка по записям пользователя. */
export async function TraderProfileCard({ trades }: { trades: StatTrade[] }) {
  const { t } = await getTranslator();
  const style = detectStyle(trades);
  const market = detectMarket(trades);
  const behavior = detectBehavior(trades);
  const enough = trades.length >= MIN_TRADES_FOR_PROFILE;
  const dur = (m: number) => (m >= 1440 ? t("tradertypes.units.d", { n: Math.round((m / 1440) * 10) / 10 }) : m >= 60 ? t("tradertypes.units.h", { n: Math.round((m / 60) * 10) / 10 }) : t("tradertypes.units.m", { n: Math.max(1, Math.round(m)) }));

  const row = (label: string, name: string | null, hint: string | null, id: string | null) => (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm sm:text-right">
        {name ? <Link href={`/trader-types#${id}`} className="font-semibold hover:underline">{name}</Link> : <span className="text-muted">{t("tradertypes.you.unknown")}</span>}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </dd>
    </div>
  );

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">{t("tradertypes.you.title")}</h2>
        <p className="text-sm text-muted">{t("tradertypes.you.subtitle")}</p>
      </div>
      {!enough ? (
        <p className="text-sm text-muted">{t("tradertypes.you.need")}</p>
      ) : (
        <dl className="divide-y divide-border">
          {row(t("tradertypes.you.style"), style ? t(`tradertypes.types.${style.style}.name`) : null, style ? t("tradertypes.you.median", { t: dur(style.medianMinutes) }) : t("tradertypes.you.needStyle"), style?.style ?? null)}
          {row(t("tradertypes.you.market"), market ? t(`tradertypes.types.${market.market}.name`) : null, market ? t("tradertypes.you.share", { p: Math.round(market.share * 100) }) : null, market?.market ?? null)}
          {row(t("tradertypes.you.behavior"), behavior ? t(`tradertypes.types.${behavior.behavior}.name`) : null, behavior ? t("tradertypes.you.share", { p: Math.round(behavior.share * 100) }) : null, behavior?.behavior ?? null)}
        </dl>
      )}
      <Link href="/trader-types" className="inline-block text-sm font-medium text-primary hover:underline">{t("tradertypes.you.all")} →</Link>
    </Card>
  );
}
