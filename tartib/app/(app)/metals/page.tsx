import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { MetalsLive } from "@/components/metals/MetalsLive";
import { requireUser } from "@/lib/auth";
import { sharedJson } from "@/lib/edge-cache";
import { ALL_METALS_SYMBOLS } from "@/lib/metals";
import { getTranslator } from "@/lib/i18n/server";
import { fetchQuotes } from "@/lib/stock-data";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("metals.title") };
}

const NAME_KEYS: Record<string, string> = {
  "GC=F": "gold", "SI=F": "silver", "PL=F": "platinum", "PA=F": "palladium", "HG=F": "copper",
  GLD: "gld", IAU: "iau", SLV: "slv", GDX: "gdx", "DX-Y.NYB": "dxy", "^TNX": "tnx", "EURUSD=X": "eurusd", "USDUZS=X": "usduzs",
};

export default async function MetalsPage() {
  const { t } = await getTranslator();
  await requireUser();
  const initial = (await sharedJson(`quotes:${[...ALL_METALS_SYMBOLS].sort().join(",")}`, 10, async () => {
    const q = await fetchQuotes(ALL_METALS_SYMBOLS, fetch, 10);
    return q.length > 0 ? q.map((x) => ({ symbol: x.symbol, price: x.price, changePct: x.changePct })) : null;
  })) ?? [];
  const names = Object.fromEntries(Object.entries(NAME_KEYS).map(([s, k]) => [s, t(`worldmarkets.names.${k}`)]));
  const links = [
    { href: "/tools/metals-lot", key: "lot" },
    { href: "/tools/metal-value", key: "value" },
    { href: "/tools/bullion-breakeven", key: "bullion" },
    { href: "/tools/futures-risk", key: "futures" },
    { href: "/market", key: "alerts" },
    { href: "/charts?pair=GC%3DF", key: "chart" },
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("metals.title")}</h1>
        <p className="mt-1 text-muted">{t("metals.subtitle")}</p>
      </div>
      <MetalsLive initial={initial} names={names} />
      <section aria-labelledby="metals-tools" className="space-y-3">
        <h2 id="metals-tools" className="text-lg font-semibold">{t("metals.toolsTitle")}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((l) => (
            <Link key={l.key} href={l.href} className="block min-w-0 focus-visible:outline-none">
              <Card className="h-full space-y-1 p-4 transition hover:border-primary">
                <p className="font-medium">{t(`metals.links.${l.key}.title`)}</p>
                <p className="text-sm text-muted">{t(`metals.links.${l.key}.desc`)}</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>
      <p className="text-xs leading-relaxed text-muted">{t("metals.note")} {t("common.disclaimer")}</p>
    </div>
  );
}
