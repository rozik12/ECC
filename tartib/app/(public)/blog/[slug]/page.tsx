import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonStyles } from "@/components/ui";
import { ARTICLES, getArticle } from "@/lib/articles";
import { getTranslator } from "@/lib/i18n/server";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return {};
  const { locale } = await getTranslator();
  const x = article.text[locale];
  return { title: x.title, description: x.description, alternates: { canonical: `/blog/${slug}` } };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();
  const { t, locale } = await getTranslator();
  const x = article.text[locale];

  return (
    <article className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <Link href="/blog" className="text-sm text-muted hover:text-foreground">{t("blog.back")}</Link>
      <header>
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{x.title}</h1>
        <p className="mt-3 text-xs text-muted">
          <time dateTime={article.date}>{article.date}</time> · {t("blog.minutes", { n: x.minutes })}
        </p>
      </header>
      {x.sections.map((s) => (
        <section key={s.h} className="space-y-3">
          <h2 className="text-lg font-semibold">{s.h}</h2>
          {s.p.map((para) => (
            <p key={para} className="leading-relaxed text-foreground/90">{para}</p>
          ))}
        </section>
      ))}
      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="font-medium">{t("blog.cta")}</p>
        <Link href="/register" className={buttonStyles({ className: "mt-3" })}>{t("blog.ctaBtn")}</Link>
      </div>
      <p className="text-xs leading-relaxed text-muted">{t("blog.edu")} {t("common.disclaimer")}</p>
    </article>
  );
}
