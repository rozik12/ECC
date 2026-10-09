import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SessionsClock } from "@/components/tools/SessionsClock";
import { ToolRunner } from "@/components/tools/ToolRunner";
import { buttonStyles } from "@/components/ui";
import { getTranslator } from "@/lib/i18n/server";
import { CALC_SLUGS, DICT_KEY, TOOL_SLUGS, type ToolSlug } from "@/lib/tool-defs";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return TOOL_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!(TOOL_SLUGS as readonly string[]).includes(slug)) return {};
  const { t } = await getTranslator();
  return { title: t(`tools.${DICT_KEY[slug]}.title`), description: t(`tools.${DICT_KEY[slug]}.desc`), alternates: { canonical: `/tools/${slug}` } };
}

export default async function ToolPage({ params }: Props) {
  const { slug } = await params;
  if (!(TOOL_SLUGS as readonly string[]).includes(slug)) notFound();
  const { t } = await getTranslator();
  const key = DICT_KEY[slug];
  const extra = key === "sessions" ? "" : t(`tools.${key}.note`);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <Link href="/tools" className="text-sm text-muted hover:text-foreground">{t("tools.all")}</Link>
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t(`tools.${key}.title`)}</h1>
        <p className="mt-2 text-muted">{t(`tools.${key}.desc`)}</p>
      </div>
      {(CALC_SLUGS as readonly string[]).includes(slug) ? <ToolRunner slug={slug as ToolSlug} /> : <SessionsClock />}
      {extra && extra !== `tools.${key}.note` && <p className="text-sm text-muted">{extra}</p>}
      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="font-medium">{t("tools.cta")}</p>
        <Link href="/register" className={buttonStyles({ className: "mt-3" })}>{t("tools.ctaBtn")}</Link>
      </div>
      <p className="text-xs leading-relaxed text-muted">{t("tools.note")} {t("common.disclaimer")}</p>
    </div>
  );
}
