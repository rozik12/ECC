import { Card, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { sharedJson } from "@/lib/edge-cache";
import { fetchDerivatives, type DerivRow } from "@/lib/derivatives";
import { formatCompact, formatNumber } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";

/** Бессрочные контракты: ставка фандинга, открытый интерес и соотношение лонгов и шортов. Цвета не используются: рост и падение здесь не «хорошо» и не «плохо». */
export async function DerivativesCard() {
  const { t, locale } = await getTranslator();
  const rows = await sharedJson<DerivRow[]>("derivatives", 60, () => fetchDerivatives(fetch, 30));
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-semibold">{t("derivatives.title")}</h2>
        <p className="mt-1 text-xs text-muted">{t("derivatives.hint")}</p>
      </div>
      {!rows ? (
        <p className="text-sm text-muted">{t("market.unavailable")}</p>
      ) : (
        <Table>
          <THead>
            <Tr><Th>{t("derivatives.coin")}</Th><Th>{t("derivatives.funding")}</Th><Th>{t("derivatives.annual")}</Th><Th>{t("derivatives.oi")}</Th><Th>{t("derivatives.ls")}</Th></Tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <Tr key={r.coin}>
                <Td label={t("derivatives.coin")} className="font-medium">{r.coin}<span className="text-xs text-muted">/USDT</span></Td>
                <Td label={t("derivatives.funding")} className="tabular-nums">{r.funding ? `${r.funding.rate > 0 ? "+" : ""}${formatNumber(r.funding.rate, locale, 4)}%${r.funding.perHours ? ` / ${t("derivatives.hours", { n: r.funding.perHours })}` : ""}` : "—"}</Td>
                <Td label={t("derivatives.annual")} className="tabular-nums">{r.funding?.annualPct != null ? `${r.funding.annualPct > 0 ? "+" : ""}${formatNumber(r.funding.annualPct, locale, 1)}%` : "—"}</Td>
                <Td label={t("derivatives.oi")} className="tabular-nums">{r.oiUsd !== null ? `$${formatCompact(r.oiUsd, locale)}` : "—"}</Td>
                <Td label={t("derivatives.ls")} className="tabular-nums">{r.longShort !== null ? formatNumber(r.longShort, locale, 2) : "—"}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
      <p className="text-xs leading-relaxed text-muted">{t("derivatives.note")}</p>
    </Card>
  );
}
