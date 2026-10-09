// Лента новостей из открытых RSS-каналов. Храним и показываем только заголовок, источник, время и ссылку на оригинал.

export type NewsCategory = "crypto" | "markets" | "uzbekistan";
export type NewsLang = "ru" | "en" | "uz";

export type NewsSource = { id: string; name: string; url: string; lang: NewsLang; category: NewsCategory };
export type NewsItem = { title: string; link: string; at: number; source: string; sourceUrl: string; lang: NewsLang; category: NewsCategory };

export const NEWS_SOURCES: NewsSource[] = [
  { id: "cointelegraph", name: "Cointelegraph", url: "https://cointelegraph.com/rss", lang: "en", category: "crypto" },
  { id: "decrypt", name: "Decrypt", url: "https://decrypt.co/feed", lang: "en", category: "crypto" },
  { id: "coindesk", name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss", lang: "en", category: "crypto" },
  { id: "bits", name: "Bits.media", url: "https://bits.media/rss2/", lang: "ru", category: "crypto" },
  { id: "forklog", name: "ForkLog", url: "https://forklog.com/feed", lang: "ru", category: "crypto" },
  { id: "investing-en", name: "Investing.com", url: "https://www.investing.com/rss/news.rss", lang: "en", category: "markets" },
  { id: "investing-ru", name: "Investing.com", url: "https://ru.investing.com/rss/news.rss", lang: "ru", category: "markets" },
  { id: "marketwatch", name: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", lang: "en", category: "markets" },
  { id: "gazeta", name: "Gazeta.uz", url: "https://www.gazeta.uz/ru/rss/", lang: "ru", category: "uzbekistan" },
  { id: "kun", name: "Kun.uz", url: "https://kun.uz/news/rss", lang: "uz", category: "uzbekistan" },
];

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", laquo: "«", raquo: "»", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** Достаёт текст тега: убирает CDATA, разметку и лишние пробелы. */
function textOf(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  if (!m) return null;
  let v = m[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(v);
  if (cdata) v = cdata[1];
  return decodeEntities(v.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Только http(s)-ссылки, без меток отслеживания. */
export function cleanLink(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^mod$|^ref$/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return null;
  }
}

export function parseDate(raw: string | null, now = Date.now()): number | null {
  if (!raw) return null;
  const v = raw.trim();
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v) ? v.replace(" ", "T") + "Z" : v;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  // Время из будущего (ошибка часового пояса в канале) не показываем как «позже, чем сейчас»
  return Math.min(t, now);
}

/** Разбор RSS 2.0 и Atom. Возвращает записи без источника (его добавляет вызывающий). */
export function parseFeed(xml: string, now = Date.now()): { title: string; link: string; at: number }[] {
  const blocks = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi), ...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)].map((m) => m[0]);
  const out: { title: string; link: string; at: number }[] = [];
  for (const b of blocks) {
    const title = textOf(b, "title");
    let link = cleanLink(textOf(b, "link"));
    if (!link) {
      const href = /<link[^>]*href=["']([^"']+)["']/i.exec(b);
      link = cleanLink(href ? decodeEntities(href[1]) : null);
    }
    const at = parseDate(textOf(b, "pubDate") ?? textOf(b, "updated") ?? textOf(b, "published") ?? textOf(b, "dc:date"), now);
    if (!title || !link || at === null) continue;
    out.push({ title: title.slice(0, 220), link, at });
  }
  return out;
}

export function mergeNews(items: NewsItem[], limit = 200): NewsItem[] {
  const seen = new Set<string>();
  const uniq: NewsItem[] = [];
  for (const it of [...items].sort((a, b) => b.at - a.at)) {
    const key = it.link.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(it);
  }
  return uniq.slice(0, limit);
}

export function filterNews(items: NewsItem[], category: NewsCategory | "all", lang: NewsLang | "all"): NewsItem[] {
  return items.filter((i) => (category === "all" || i.category === category) && (lang === "all" || i.lang === lang));
}

const MAX_BYTES = 1_500_000;

/** Загружает все каналы параллельно. Недоступный канал просто пропускается. */
export async function fetchNews(sources: NewsSource[] = NEWS_SOURCES, now = Date.now()): Promise<{ items: NewsItem[]; failed: string[] }> {
  const failed: string[] = [];
  const results = await Promise.all(
    sources.map(async (s): Promise<NewsItem[]> => {
      try {
        const res = await fetch(s.url, {
          headers: { "user-agent": "Mozilla/5.0 (compatible; TartibNewsBot/1.0; +https://tartib.uk)", accept: "application/rss+xml, application/xml, text/xml, */*" },
          signal: AbortSignal.timeout(6000),
          // Cloudflare держит ответ канала в кэше 10 минут, чтобы не нагружать источники
          ...({ cf: { cacheTtl: 600, cacheEverything: true } } as object),
        });
        if (!res.ok) throw new Error(String(res.status));
        const text = (await res.text()).slice(0, MAX_BYTES);
        return parseFeed(text, now).slice(0, 25).map((i) => ({ ...i, source: s.name, sourceUrl: new URL(s.url).origin, lang: s.lang, category: s.category }));
      } catch {
        failed.push(s.id);
        return [];
      }
    }),
  );
  return { items: mergeNews(results.flat()), failed };
}
