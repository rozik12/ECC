// Новости рынка для бота: свежие заголовки из открытых RSS-каналов. Упрощённая копия разбора из lib/news.ts (функции Supabase не видят код сайта).
import type { Lang } from "./text.ts";

export type Headline = { title: string; link: string; at: number; source: string };

const SOURCES: Record<Lang, { name: string; url: string }[]> = {
  ru: [
    { name: "Investing.com", url: "https://ru.investing.com/rss/news.rss" },
    { name: "ForkLog", url: "https://forklog.com/feed" },
    { name: "Bits.media", url: "https://bits.media/rss2/" },
  ],
  en: [
    { name: "Cointelegraph", url: "https://cointelegraph.com/rss" },
    { name: "Investing.com", url: "https://www.investing.com/rss/news.rss" },
    { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss" },
  ],
  // Читатели на узбекском обычно читают и русские источники
  uz: [
    { name: "Investing.com", url: "https://ru.investing.com/rss/news.rss" },
    { name: "Cointelegraph", url: "https://cointelegraph.com/rss" },
    { name: "Bits.media", url: "https://bits.media/rss2/" },
  ],
};

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", laquo: "«", raquo: "»", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

function tagText(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  if (!m) return null;
  let v = m[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(v);
  if (cdata) v = cdata[1];
  return decode(v.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Только http(s)-ссылки, без меток отслеживания. */
export function safeLink(raw: string | null): string | null {
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

export function parseHeadlines(xml: string, source: string, now = Date.now()): Headline[] {
  const out: Headline[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const b = m[0];
    const title = tagText(b, "title");
    const link = safeLink(tagText(b, "link"));
    const raw = tagText(b, "pubDate") ?? tagText(b, "dc:date");
    const t = raw ? Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw) ? raw.replace(" ", "T") + "Z" : raw) : NaN;
    if (!title || !link || !Number.isFinite(t)) continue;
    out.push({ title: title.slice(0, 200), link, at: Math.min(t, now), source });
  }
  return out;
}

/** Свежие заголовки без повторов, новые сверху. Недоступный канал пропускается. */
export function mergeHeadlines(lists: Headline[][], limit: number): Headline[] {
  const seen = new Set<string>();
  const res: Headline[] = [];
  for (const h of lists.flat().sort((a, b) => b.at - a.at)) {
    const key = h.link.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    res.push(h);
    if (res.length >= limit) break;
  }
  return res;
}

const cache = new Map<Lang, { at: number; items: Headline[] }>();
const TTL = 10 * 60 * 1000;

export async function fetchHeadlines(lang: Lang, limit = 8): Promise<Headline[]> {
  const hit = cache.get(lang);
  if (hit && Date.now() - hit.at < TTL) return hit.items;
  const lists = await Promise.all(SOURCES[lang].map(async (s) => {
    try {
      const res = await fetch(s.url, { headers: { "user-agent": "Mozilla/5.0 (compatible; TartibNewsBot/1.0; +https://tartib.uk)" }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) return [];
      return parseHeadlines((await res.text()).slice(0, 1_500_000), s.name).slice(0, 10);
    } catch {
      return [];
    }
  }));
  const items = mergeHeadlines(lists, limit);
  if (items.length > 0) cache.set(lang, { at: Date.now(), items });
  return items;
}
