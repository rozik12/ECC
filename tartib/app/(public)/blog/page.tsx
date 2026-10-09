import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui";
import { ARTICLES } from "@/lib/articles";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("blog.title"), description: t("blog.subtitle") };
}

export default async function BlogPage() {
  const { t, locale } = await getTranslator();
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("blog.title")}</h1>
        <p className="mt-2 text-muted">{t("blog.subtitle")}</p>
      </div>
      <ul className="space-y-3">
        {ARTICLES.map((a) => {
          const x = a.text[locale];
          return (
            <li key={a.slug}>
              <Link href={`/blog/${a.slug}`} className="block">
                <Card className="transition-colors hover:border-primary/50">
                  <h2 className="font-semibold leading-snug">{x.title}</h2>
                  <p className="mt-2 text-sm text-muted">{x.description}</p>
                  <p className="mt-3 text-xs text-muted">
                    {t("blog.minutes", { n: x.minutes })} · <span className="font-medium text-primary">{t("blog.read")} →</span>
                  </p>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="text-xs leading-relaxed text-muted">{t("blog.edu")} {t("common.disclaimer")}</p>
    </div>
  );
}
