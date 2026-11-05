import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { getTranslator } from "@/lib/i18n/server";
import { dictPath, TOOL_SLUGS, toolGroup } from "@/lib/tool-defs";
import { X_GROUPS } from "@/lib/tools-extra";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("tools.title"), description: t("tools.subtitle"), alternates: { canonical: "/tools" } };
}

export default async function ToolsPage() {
  const { t } = await getTranslator();
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("tools.title")}</h1>
        <p className="mt-2 text-muted">{t("tools.subtitle")}</p>
      </div>
      <nav aria-label={t("tools.groupsNav")} className="flex flex-wrap gap-2">
        {X_GROUPS.map((gr) => (
          <a key={gr} href={`#g-${gr}`} className="rounded-full border border-border px-3 py-1 text-sm hover:border-primary hover:text-primary">{t(`toolsx.groups.${gr}`)}</a>
        ))}
      </nav>
      {X_GROUPS.map((gr) => (
        <section key={gr} id={`g-${gr}`} aria-labelledby={`h-${gr}`} className="scroll-mt-24 space-y-3">
          <h2 id={`h-${gr}`} className="text-lg font-semibold">{t(`toolsx.groups.${gr}`)}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {TOOL_SLUGS.filter((slug) => toolGroup(slug) === gr).map((slug) => (
              <li key={slug}>
                <Link href={`/tools/${slug}`} className="block h-full">
                  <Card className="h-full transition-colors hover:border-primary/50">
                    <h3 className="font-semibold leading-snug">{t(`${dictPath(slug)}.title`)}</h3>
                    <p className="mt-2 text-sm text-muted">{t(`${dictPath(slug)}.desc`)}</p>
                    <p className="mt-3 text-sm font-medium text-primary">{t("tools.open")} →</p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-xs leading-relaxed text-muted">{t("tools.note")} {t("common.disclaimer")}</p>
    </div>
  );
}
