import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getTranslator } from "@/lib/i18n/server";
import { fetchNews, filterNews, NEWS_SOURCES, type NewsCategory, type NewsLang } from "@/lib/news";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("news.title"), description: t("news.subtitle") };
}

const CATEGORIES = ["all", "crypto", "markets", "uzbekistan"] as const;
const LANGS = ["all", "ru", "en", "uz"] as const;
const LOCALES = { ru: "ru-RU", uz: "uz-UZ", en: "en-US" } as const;

function ago(at: number, locale: keyof typeof LOCALES): string {
  const sec = Math.max(1, Math.round((Date.now() - at) / 1000));
  const rtf = new Intl.RelativeTimeFormat(LOCALES[locale], { numeric: "auto" });
  if (sec < 3600) return rtf.format(-Math.max(1, Math.round(sec / 60)), "minute");
  if (sec < 86400) return rtf.format(-Math.round(sec / 3600), "hour");
  return rtf.format(-Math.round(sec / 86400), "day");
}

type SP = { cat?: string; lang?: string };

export default async function NewsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { t, locale } = await getTranslator();
  const cat = (CATEGORIES as readonly string[]).includes(sp.cat ?? "") ? (sp.cat as NewsCategory | "all") : "all";
  const lang = (LANGS as readonly string[]).includes(sp.lang ?? "") ? (sp.lang as NewsLang | "all") : "all";

  const { items, failed } = await fetchNews();
  const shown = filterNews(items, cat, lang).slice(0, 40);

  const href = (c: string, l: string) => `/news${c === "all" && l === "all" ? "" : `?${new URLSearchParams({ ...(c !== "all" ? { cat: c } : {}), ...(l !== "all" ? { lang: l } : {}) })}`}`;
  const chip = (active: boolean) =>
    cn("rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors", active ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:text-foreground");

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("news.title")}</h1>
        <p className="mt-2 text-muted">{t("news.subtitle")}</p>
      </div>

      <nav aria-label={t("news.title")} className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <Link key={c} href={href(c, lang)} aria-current={c === cat ? "page" : undefined} className={chip(c === cat)}>{t(`news.cats.${c}`)}</Link>
        ))}
      </nav>
      <nav aria-label={t("news.langLabel")} className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">{t("news.langLabel")}:</span>
        {LANGS.map((l) => (
          <Link key={l} href={href(cat, l)} aria-current={l === lang ? "page" : undefined} className={chip(l === lang)}>{t(`news.langs.${l}`)}</Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <Card className="text-center text-muted">{failed.length >= NEWS_SOURCES.length ? t("news.unavailable") : t("news.empty")}</Card>
      ) : (
        <ul className="space-y-3">
          {shown.map((n) => (
            <li key={n.link}>
              <a href={n.link} target="_blank" rel="noopener noreferrer nofollow" className="group block rounded-xl border border-border bg-surface p-4 transition-colors hover:border-primary/50">
                <p className="font-medium leading-snug group-hover:text-primary">{n.title}</p>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <span className="font-semibold text-foreground/80">{n.source}</span>
                  <span aria-hidden>·</span>
                  <span>{n.lang.toUpperCase()}</span>
                  <span aria-hidden>·</span>
                  <time dateTime={new Date(n.at).toISOString()}>{ago(n.at, locale)}</time>
                  <ExternalLink className="ml-auto h-3.5 w-3.5 opacity-60" aria-hidden />
                </p>
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-muted">
        {t("news.note")} {NEWS_SOURCES.filter((s) => cat === "all" || s.category === cat).map((s) => s.name).filter((n, i, a) => a.indexOf(n) === i).join(", ")}.
      </p>
      <p className="text-xs leading-relaxed text-muted">{t("common.disclaimer")}</p>
    </div>
  );
}
