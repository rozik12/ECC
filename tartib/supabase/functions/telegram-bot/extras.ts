// Команды бота, которые повторяют возможности сайта: металлы, письмо владельцу, непрочитанные сообщения мессенджера, ссылки.
// Файл без обращений к базе, чтобы его можно было тестировать. Сами запросы к базе делает index.ts.
// Самостоятельный файл: его же использует маленькая функция-маршрутизатор (telegram-router), поэтому здесь нет импортов из остального бота.
export type Lang = "ru" | "uz" | "en";
export type Btn = { text: string; callback_data?: string; url?: string };
export type Kb = { inline_keyboard: Btn[][] };
export type Screen = { text: string; kb?: Kb };

const SITE = "https://tartib.uk";
const LOCALE: Record<Lang, string> = { ru: "ru-RU", en: "en-US", uz: "uz-UZ" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const num = (n: number, lang: Lang, digits = 2) => new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: digits }).format(n);

export const CHANNEL_URL = "https://t.me/tartibuk";
export const SUPPORT_MAX = 2000;

type Dict = Record<string, string>;
const X: Record<Lang, Dict> = {
  ru: {
    metalsTitle: "🥇 <b>Золото и металлы</b>",
    gold: "Золото", silver: "Серебро", platinum: "Платина", palladium: "Палладий", copper: "Медь",
    metalsNote: "Цены фьючерсов COMEX из открытого источника, возможна задержка. Золото, серебро, платина и палладий: $ за унцию, медь: $ за фунт. Справочные данные, а не рекомендация.",
    metalsNone: "Цены металлов сейчас недоступны. Попробуй позже или открой страницу на сайте.",
    metalsSite: "🌐 Подробнее на сайте",
    supportUsage: "✉️ <b>Написать владельцу</b>\n\nНапиши вопрос или предложение одним сообщением после команды:\n<code>/support Не вижу график в сделке</code>\n\nОтвет придёт уведомлением в Telegram, а переписка видна на сайте.",
    supportSent: "✅ Отправил владельцу. Ответ придёт сюда уведомлением.",
    supportLimit: "Сегодня уже много сообщений. Попробуй завтра.",
    supportLong: "Слишком длинное сообщение: не больше {n} знаков.",
    supportErr: "Не получилось отправить. Попробуй позже.",
    supportSite: "🌐 Переписка на сайте",
    msgTitle: "💬 <b>Мессенджер</b>",
    msgNone: "Новых сообщений нет.",
    msgSome: "Непрочитанных: <b>{n}</b> в чатах: {chats}.",
    msgOpen: "💬 Открыть мессенджер",
    msgNoHandle: "Чтобы общаться с другими трейдерами, выбери ник на сайте: «Сообщения».",
    siteTitle: "🌐 <b>Tartib</b>\n\nСайт, инструменты, блог и наш канал в Telegram.",
    bSite: "🌐 Сайт", bTools: "🧰 Калькуляторы", bBlog: "📚 Блог", bMetals: "🥇 Металлы", bMessages: "💬 Мессенджер", bChannel: "📣 Канал",
    helpExtra: "<b>Ещё команды</b>\n/metals: цены золота и металлов\n/support текст: написать владельцу\n/messages: непрочитанные в мессенджере\n/site: ссылки на сайт и канал",
  },
  uz: {
    metalsTitle: "🥇 <b>Oltin va metallar</b>",
    gold: "Oltin", silver: "Kumush", platinum: "Platina", palladium: "Palladiy", copper: "Mis",
    metalsNote: "COMEX fyuchers narxlari ochiq manbadan, kechikish bo’lishi mumkin. Oltin, kumush, platina va palladiy: untsiyasi uchun $, mis: funti uchun $. Bu ma’lumot uchun, tavsiya emas.",
    metalsNone: "Metall narxlari hozir mavjud emas. Keyinroq urinib ko’ring yoki saytdagi sahifani oching.",
    metalsSite: "🌐 Saytda batafsil",
    supportUsage: "✉️ <b>Egasiga yozish</b>\n\nSavol yoki taklifni buyruqdan keyin bitta xabarda yozing:\n<code>/support Bitimdagi grafik ko’rinmayapti</code>\n\nJavob Telegramga bildirishnoma bo’lib keladi, yozishma saytda ham ko’rinadi.",
    supportSent: "✅ Egasiga yuborildi. Javob shu yerga bildirishnoma bo’lib keladi.",
    supportLimit: "Bugun xabarlar juda ko’p yuborildi. Ertaga urinib ko’ring.",
    supportLong: "Xabar juda uzun: {n} belgidan oshmasin.",
    supportErr: "Yuborib bo’lmadi. Keyinroq urinib ko’ring.",
    supportSite: "🌐 Yozishma saytda",
    msgTitle: "💬 <b>Messenjer</b>",
    msgNone: "Yangi xabarlar yo’q.",
    msgSome: "O’qilmagan: <b>{n}</b>, chatlar soni: {chats}.",
    msgOpen: "💬 Messenjerni ochish",
    msgNoHandle: "Boshqa treyderlar bilan yozishish uchun saytda «Xabarlar» bo’limida nik tanlang.",
    siteTitle: "🌐 <b>Tartib</b>\n\nSayt, vositalar, blog va Telegramdagi kanalimiz.",
    bSite: "🌐 Sayt", bTools: "🧰 Kalkulyatorlar", bBlog: "📚 Blog", bMetals: "🥇 Metallar", bMessages: "💬 Messenjer", bChannel: "📣 Kanal",
    helpExtra: "<b>Yana buyruqlar</b>\n/metals: oltin va metall narxlari\n/support matn: egasiga yozish\n/messages: messenjerdagi o’qilmaganlar\n/site: sayt va kanal havolalari",
  },
  en: {
    metalsTitle: "🥇 <b>Gold and metals</b>",
    gold: "Gold", silver: "Silver", platinum: "Platinum", palladium: "Palladium", copper: "Copper",
    metalsNote: "COMEX futures prices from an open source, may be delayed. Gold, silver, platinum and palladium: $ per ounce, copper: $ per pound. Reference data, not a recommendation.",
    metalsNone: "Metal prices are unavailable right now. Try later or open the page on the site.",
    metalsSite: "🌐 More on the site",
    supportUsage: "✉️ <b>Write to the owner</b>\n\nSend your question or idea in one message after the command:\n<code>/support I cannot see the chart in a trade</code>\n\nThe reply arrives as a Telegram notification, and the conversation is visible on the site.",
    supportSent: "✅ Sent to the owner. The reply will come here as a notification.",
    supportLimit: "Too many messages today. Try again tomorrow.",
    supportLong: "Message is too long: up to {n} characters.",
    supportErr: "Could not send. Try again later.",
    supportSite: "🌐 Conversation on the site",
    msgTitle: "💬 <b>Messenger</b>",
    msgNone: "No new messages.",
    msgSome: "Unread: <b>{n}</b> in {chats} chats.",
    msgOpen: "💬 Open messenger",
    msgNoHandle: "To chat with other traders, pick a handle on the site under “Messages”.",
    siteTitle: "🌐 <b>Tartib</b>\n\nThe site, tools, blog and our Telegram channel.",
    bSite: "🌐 Site", bTools: "🧰 Calculators", bBlog: "📚 Blog", bMetals: "🥇 Metals", bMessages: "💬 Messenger", bChannel: "📣 Channel",
    helpExtra: "<b>More commands</b>\n/metals: gold and metals prices\n/support text: write to the owner\n/messages: unread in the messenger\n/site: links to the site and channel",
  },
};

export function xt(lang: Lang, key: string, vars: Record<string, string | number> = {}): string {
  const raw = X[lang][key] ?? X.en[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

const kbOf = (...rows: { text: string; url: string }[][]): Kb => ({ inline_keyboard: rows });

// ---------- металлы ----------
export const METALS = [
  { key: "gold", sym: "GC=F", icon: "🥇" },
  { key: "silver", sym: "SI=F", icon: "🥈" },
  { key: "platinum", sym: "PL=F", icon: "⚪" },
  { key: "palladium", sym: "PA=F", icon: "⚫" },
  { key: "copper", sym: "HG=F", icon: "🟠" },
] as const;

export type MetalRow = { key: string; icon: string; price: number; changePct: number | null };

/** Ответ графика Yahoo → цена и вчерашнее закрытие. Любая странность → null. */
export function parseMeta(body: unknown): { price: number; prev: number | null } | null {
  const meta = (body as { chart?: { result?: { meta?: Record<string, unknown> }[] } } | null)?.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice);
  if (!meta || !Number.isFinite(price) || price <= 0) return null;
  const prev = Number(meta.chartPreviousClose ?? meta.previousClose);
  return { price, prev: Number.isFinite(prev) && prev > 0 ? prev : null };
}

let cache: { at: number; rows: MetalRow[] } | null = null;

/** Цены металлов. Ответы кэшируются на 30 секунд, чтобы много людей не нагружали источник. */
export async function fetchMetals(now = Date.now()): Promise<MetalRow[]> {
  if (cache && now - cache.at < 30_000) return cache.rows;
  const rows = await Promise.all(METALS.map(async (m) => {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(m.sym)}?range=1d&interval=1d`, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) });
      if (!r.ok) return null;
      const p = parseMeta(await r.json());
      if (!p) return null;
      return { key: m.key, icon: m.icon, price: p.price, changePct: p.prev ? ((p.price - p.prev) / p.prev) * 100 : null } as MetalRow;
    } catch {
      return null;
    }
  }));
  const ok = rows.filter((r): r is MetalRow => r !== null);
  if (ok.length > 0) cache = { at: now, rows: ok };
  return ok;
}

export function metalsScreen(lang: Lang, rows: MetalRow[]): Screen {
  const site = [[{ text: xt(lang, "metalsSite"), url: `${SITE}/metals` }]];
  if (rows.length === 0) return { text: `${xt(lang, "metalsTitle")}\n\n${xt(lang, "metalsNone")}`, kb: kbOf(...site) };
  const lines = rows.map((r) => {
    const ch = r.changePct === null ? "" : ` (${r.changePct > 0 ? "+" : ""}${num(r.changePct, lang)}%)`;
    return `${r.icon} <b>${esc(xt(lang, r.key))}</b>: ${num(r.price, lang)} $${ch}`;
  });
  return { text: `${xt(lang, "metalsTitle")}\n\n${lines.join("\n")}\n\n<i>${xt(lang, "metalsNote")}</i>`, kb: kbOf(...site) };
}

// ---------- письмо владельцу ----------
export function supportUsage(lang: Lang): Screen {
  return { text: xt(lang, "supportUsage"), kb: kbOf([{ text: xt(lang, "supportSite"), url: `${SITE}/support` }]) };
}
export const supportDone = (lang: Lang, key: "supportSent" | "supportLimit" | "supportErr" | "supportLong"): Screen => ({
  text: xt(lang, key, { n: SUPPORT_MAX }),
  kb: kbOf([{ text: xt(lang, "supportSite"), url: `${SITE}/support` }]),
});

// ---------- мессенджер ----------
export function messagesScreen(lang: Lang, hasHandle: boolean, total: number, chats: number): Screen {
  const body = !hasHandle ? xt(lang, "msgNoHandle") : total > 0 ? xt(lang, "msgSome", { n: total >= 99 ? "99+" : total, chats }) : xt(lang, "msgNone");
  return { text: `${xt(lang, "msgTitle")}\n\n${body}`, kb: kbOf([{ text: xt(lang, "msgOpen"), url: `${SITE}/messages` }]) };
}

// ---------- ссылки ----------
export function siteScreen(lang: Lang): Screen {
  return {
    text: xt(lang, "siteTitle"),
    kb: kbOf(
      [{ text: xt(lang, "bSite"), url: SITE }, { text: xt(lang, "bTools"), url: `${SITE}/tools` }],
      [{ text: xt(lang, "bBlog"), url: `${SITE}/blog` }, { text: xt(lang, "bMetals"), url: `${SITE}/metals` }],
      [{ text: xt(lang, "bMessages"), url: `${SITE}/messages` }, { text: xt(lang, "bChannel"), url: CHANNEL_URL }],
    ),
  };
}

/** Справка: к стандартному тексту добавляется список новых команд. */
export function withHelpExtra(lang: Lang, help: Screen): Screen {
  return { ...help, text: `${help.text}\n\n${xt(lang, "helpExtra")}` };
}
