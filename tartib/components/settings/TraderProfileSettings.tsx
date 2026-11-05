"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTraderProfileAction } from "@/app/actions/settings";
import { Alert, Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";
import { HORIZONS, TRADER_MARKETS, type Horizon, type TraderMarket } from "@/lib/trader-profile";

/** «Какой вы трейдер»: срок удержания сделок и рынки. По ним главная показывает нужные ярлыки, а форма сделки подставляет рынок. */
export function TraderProfileSettings({ horizon: initialHorizon, markets: initialMarkets }: { horizon: Horizon | null; markets: TraderMarket[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [horizon, setHorizon] = useState<Horizon | null>(initialHorizon);
  const [markets, setMarkets] = useState<TraderMarket[]>(initialMarkets);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chip = (active: boolean) => cn("min-h-11 rounded-xl border px-3 text-sm", active ? "border-primary bg-primary-soft font-medium text-primary" : "border-border text-muted hover:text-foreground");

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await updateTraderProfileAction({ horizon, markets });
      if (!r.ok) return setError(r.error);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">{t("traderprofile.title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("traderprofile.text")}</p>
      </div>
      {error && <Alert tone="danger">{t(error)}</Alert>}
      {saved && <Alert tone="success">{t("settings.saved")}</Alert>}
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t("traderprofile.horizon")}</legend>
        <div className="flex flex-wrap gap-2">
          {HORIZONS.map((h) => (
            <button key={h} type="button" aria-pressed={horizon === h} onClick={() => { setHorizon(horizon === h ? null : h); setSaved(false); }} className={chip(horizon === h)}>
              {t(`traderprofile.horizons.${h}`)}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t("traderprofile.markets")}</legend>
        <div className="flex flex-wrap gap-2">
          {TRADER_MARKETS.map((m) => (
            <button key={m} type="button" aria-pressed={markets.includes(m)} onClick={() => { setMarkets((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m])); setSaved(false); }} className={chip(markets.includes(m))}>
              {t(`traderprofile.marketNames.${m}`)}
            </button>
          ))}
        </div>
      </fieldset>
      <Button onClick={save} disabled={pending}>{t("common.save")}</Button>
    </Card>
  );
}
