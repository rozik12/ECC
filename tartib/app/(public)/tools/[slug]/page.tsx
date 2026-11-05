import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UsMarketCard } from "@/components/market/UsMarketCard";
import { SessionsClock } from "@/components/tools/SessionsClock";
import { ToolRunner } from "@/components/tools/ToolRunner";
import { buttonStyles } from "@/components/ui";
import { JsonLd } from "@/components/seo/JsonLd";
import { getTranslator } from "@/lib/i18n/server";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { CALC_SLUGS, dictPath, TOOL_SLUGS, toolGroup, type ToolSlug } from "@/lib/tool-defs";
import { DICT_KEY } from "@/lib/tool-defs";
import { isExtraSlug } from "@/lib/tools-extra";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return TOOL_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!(TOOL_SLUGS as readonly string[]).includes(slug)) return {};
  const { t } = await getTranslator();
  return { title: t(`${dictPath(slug)}.title`), description: t(`${dictPath(slug)}.desc`), alternates: { canonical: `/tools/${slug}` } };
}

export default async function ToolPage({ params }: Props) {
  const { slug } = await params;
  if (!(TOOL_SLUGS as readonly string[]).includes(slug)) notFound();
  const { t, locale } = await getTranslator();
  const path = dictPath(slug);
  const extra = slug === "sessions" ? "" : t(`${path}.note`);
  // Подписи дополнительных инструментов берём из серверного словаря и передаём только этому калькулятору
  const section = isExtraSlug(slug) ? ((dictionaries[locale] as unknown as { toolsx: Record<string, { f: Record<string, string>; c?: Record<string, string>; o: Record<string, string> }> }).toolsx[DICT_KEY[slug]]) : null;
  const texts = section ? { f: section.f, c: section.c ?? {}, o: section.o } : undefined;
  const related = TOOL_SLUGS.filter((s) => s !== slug && toolGroup(s) === toolGroup(slug)).slice(0, 5);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: t(`${path}.title`),
        description: t(`${path}.desc`),
        url: `${siteUrl}/tools/${slug}`,
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      }} />
      <Link href="/tools" className="text-sm text-muted hover:text-foreground">{t("tools.all")}</Link>
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t(`${path}.title`)}</h1>
        <p className="mt-2 text-muted">{t(`${path}.desc`)}</p>
      </div>
      {(CALC_SLUGS as readonly string[]).includes(slug) ? <ToolRunner slug={slug as ToolSlug} texts={texts} /> : (
        <>
          <SessionsClock />
          <UsMarketCard />
        </>
      )}
      {extra && extra !== `${path}.note` && <p className="text-sm text-muted">{extra}</p>}
      {related.length > 0 && (
        <section aria-labelledby="related-tools" className="space-y-2">
          <h2 id="related-tools" className="text-sm font-semibold uppercase tracking-wide text-muted">{t("tools.related")}</h2>
          <ul className="flex flex-wrap gap-2">
            {related.map((r) => (
              <li key={r}><Link href={`/tools/${r}`} className="inline-block rounded-lg border border-border px-3 py-1.5 text-sm hover:border-primary hover:text-primary">{t(`${dictPath(r)}.title`)}</Link></li>
            ))}
          </ul>
        </section>
      )}
      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="font-medium">{t("tools.cta")}</p>
        <Link href="/register" className={buttonStyles({ className: "mt-3" })}>{t("tools.ctaBtn")}</Link>
      </div>
      <p className="text-xs leading-relaxed text-muted">{t("tools.note")} {t("common.disclaimer")}</p>
    </div>
  );
}
