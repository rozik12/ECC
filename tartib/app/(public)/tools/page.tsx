import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { getTranslator } from "@/lib/i18n/server";
import { DICT_KEY, TOOL_SLUGS } from "@/lib/tool-defs";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("tools.title"), description: t("tools.subtitle") };
}

export default async function ToolsPage() {
  const { t } = await getTranslator();
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("tools.title")}</h1>
        <p className="mt-2 text-muted">{t("tools.subtitle")}</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {TOOL_SLUGS.map((slug) => (
          <li key={slug}>
            <Link href={`/tools/${slug}`} className="block h-full">
              <Card className="h-full transition-colors hover:border-primary/50">
                <h2 className="font-semibold leading-snug">{t(`tools.${DICT_KEY[slug]}.title`)}</h2>
                <p className="mt-2 text-sm text-muted">{t(`tools.${DICT_KEY[slug]}.desc`)}</p>
                <p className="mt-3 text-sm font-medium text-primary">{t("tools.open")} →</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-muted">{t("tools.note")} {t("common.disclaimer")}</p>
    </div>
  );
}
