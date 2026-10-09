// Лента новостей из открытых RSS-каналов. Храним и показываем только заголовок, картинку-превью, источник, время и ссылку на оригинал.

export type NewsCategory = "crypto" | "markets" | "forex" | "uzbekistan";
export type NewsLang = "ru" | "en" | "uz";

/** onlyTrading: канал общий (не только про финансы), берём только заголовки по теме трейдинга */
export type NewsSource = { id: string; name: string; url: string; lang: NewsLang; category: NewsCategory; onlyTrading?: boolean };
export type NewsItem = { title: string; link: string; at: number; image?: string; source: string; sourceUrl: string; lang: NewsLang; category: NewsCategory };

export const NEWS_SOURCES: NewsSource[] = [
  { id: "cointelegraph", name: "Cointelegraph", url: "https://cointelegraph.com/rss", lang: "en", category: "crypto" },
  { id: "decrypt", name: "Decrypt", url: "https://decrypt.co/feed", lang: "en", category: "crypto" },
  { id: "coindesk", name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss", lang: "en", category: "crypto" },
  { id: "bits", name: "Bits.media", url: "https://bits.media/rss2/", lang: "ru", category: "crypto" },
  { id: "forklog", name: "ForkLog", url: "https://forklog.com/feed", lang: "ru", category: "crypto" },
  { id: "investing-en", name: "Investing.com", url: "https://www.investing.com/rss/news.rss", lang: "en", category: "markets" },
  { id: "investing-ru", name: "Investing.com", url: "https://ru.investing.com/rss/news.rss", lang: "ru", category: "markets" },
  { id: "marketwatch", name: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", lang: "en", category: "markets", onlyTrading: true },
  { id: "investing-comm", name: "Investing.com", url: "https://www.investing.com/rss/news_11.rss", lang: "en", category: "markets" },
  { id: "investing-forex", name: "Investing.com", url: "https://www.investing.com/rss/news_1.rss", lang: "en", category: "forex" },
  { id: "investing-forex-ru", name: "Investing.com", url: "https://ru.investing.com/rss/news_1.rss", lang: "ru", category: "forex" },
  { id: "gazeta", name: "Gazeta.uz", url: "https://www.gazeta.uz/ru/rss/", lang: "ru", category: "uzbekistan", onlyTrading: true },
  { id: "spot", name: "Spot.uz", url: "https://www.spot.uz/ru/rss/", lang: "ru", category: "uzbekistan", onlyTrading: true },
  { id: "review", name: "Review.uz", url: "https://review.uz/ru/rss", lang: "ru", category: "uzbekistan", onlyTrading: true },
  { id: "uzdaily", name: "UzDaily", url: "https://uzdaily.uz/rss", lang: "en", category: "uzbekistan", onlyTrading: true },
  { id: "kun", name: "Kun.uz", url: "https://kun.uz/news/rss", lang: "uz", category: "uzbekistan", onlyTrading: true },
];

// Слова по теме трейдинга (часть слова: «крипт» найдёт «криптовалюта»). Короткие слова — только целиком.
const TRADING_PARTS = [
  "bitcoin", "crypto", "ethereum", "stock", "shares", "markets", "trading", "trader", "forex", "currenc", "dollar", "inflation", "interest rate", "central bank", "federal reserve",
  "commodit", "crude", "wall street", "nasdaq", "s&p", "dow jones", "treasury", "earnings", "exchange rate", "stablecoin", "binance", "rally", "sell-off", "selloff",
  "биткоин", "биткойн", "крипт", "эфириум", "акци", "бирж", "трейд", "форекс", "валют", "доллар", "рубл", "курс", "инфляц", "ставк", "центробанк", "нефт", "золот", "серебр", "облигац",
  "kripto", "bitkoin", "birja", "aksiya", "valyuta", "kurs", "inflyatsiya", "markaziy bank", "neft", "oltin", "stavka", "obligatsiya",
  "курси", "валюта", "биржа",
];
// Короткие слова — только целиком, чтобы «Chipotle» не считалось «IPO»
const TRADING_WORDS = ["btc", "eth", "fed", "ecb", "oil", "gold", "sec", "usd", "eur", "uzs", "rub", "usdt", "etf", "ipo", "bond", "bonds", "gdp", "ввп", "сум", "sum"];
const WORD_RE = new RegExp(`(?<![\\p{L}\\d])(?:${TRADING_WORDS.join("|")})(?![\\p{L}\\d])`, "iu");

export function isTradingRelated(title: string): boolean {
  const t = title.toLowerCase();
  return TRADING_PARTS.some((w) => t.includes(w)) || WORD_RE.test(t);
}

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

/** Картинка-превью: только https, без пикселей слежения. */
export function cleanImage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(decodeEntities(raw.trim()));
    if (u.protocol === "http:") u.protocol = "https:";
    if (u.protocol !== "https:") return null;
    if (/pixel|beacon|tracking|1x1|spacer/i.test(u.pathname)) return null;
    if (/\.svg(\?|$)/i.test(u.pathname + u.search)) return null;
    return u.toString().slice(0, 600);
  } catch {
    return null;
  }
}

/** Ищет картинку в записи: media:content, media:thumbnail, enclosure, потом первый <img>. */
export function imageOf(block: string): string | null {
  const tags = [...block.matchAll(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*>/gi)].map((m) => m[0]);
  for (const tag of tags) {
    const url = /\burl=["']([^"']+)["']/i.exec(tag)?.[1];
    const type = /\b(?:type|medium)=["']([^"']+)["']/i.exec(tag)?.[1] ?? "";
    if (!url || (type && !/image/i.test(type))) continue;
    if (!type && !/\.(jpe?g|png|webp|avif)(\?|$)/i.test(url) && !/thumbnail/i.test(tag)) continue;
    const c = cleanImage(url);
    if (c) return c;
  }
  const html = decodeEntities(block.replace(/<!\[CDATA\[|\]\]>/g, ""));
  const m = /<img\b[^>]*?\bsrc=["']([^"']+)["']/i.exec(html);
  return cleanImage(m?.[1]);
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
export function parseFeed(xml: string, now = Date.now()): { title: string; link: string; at: number; image?: string }[] {
  const blocks = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi), ...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)].map((m) => m[0]);
  const out: { title: string; link: string; at: number; image?: string }[] = [];
  for (const b of blocks) {
    const title = textOf(b, "title");
    let link = cleanLink(textOf(b, "link"));
    if (!link) {
      const href = /<link[^>]*href=["']([^"']+)["']/i.exec(b);
      link = cleanLink(href ? decodeEntities(href[1]) : null);
    }
    const at = parseDate(textOf(b, "pubDate") ?? textOf(b, "updated") ?? textOf(b, "published") ?? textOf(b, "dc:date"), now);
    if (!title || !link || at === null) continue;
    const image = imageOf(b);
    out.push({ title: title.slice(0, 220), link, at, ...(image ? { image } : {}) });
  }
  return out;
}

export function mergeNews(items: NewsItem[], limit = 200): NewsItem[] {
  const seen = new Map<string, NewsItem>();
  const uniq: NewsItem[] = [];
  for (const it of [...items].sort((a, b) => b.at - a.at)) {
    const key = it.link.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const prev = seen.get(key);
    if (prev) {
      if (!prev.image && it.image) prev.image = it.image;
      continue;
    }
    const copy = { ...it };
    seen.set(key, copy);
    uniq.push(copy);
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
        const all = parseFeed(text, now);
        return (s.onlyTrading ? all.filter((i) => isTradingRelated(i.title)) : all).slice(0, 25).map((i) => ({ ...i, source: s.name, sourceUrl: new URL(s.url).origin, lang: s.lang, category: s.category }));
      } catch {
        failed.push(s.id);
        return [];
      }
    }),
  );
  return { items: mergeNews(results.flat()), failed };
}
