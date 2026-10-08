export type Lang = "ru" | "uz" | "en";

export const langOf = (code: string | null | undefined): Lang => (code === "ru" || code === "uz" ? code : "en");

type Dict = {
  needLink: string; startHelp: string; linked: string; codeInvalid: string; help: string; unlinked: string;
  today: (n: number, followed: number, pnl: string) => string; noTradesToday: string;
  remindersOn: string; remindersOff: string; remindersUsage: string;
  saved: (line: string) => string; rulesOk: string; rulesBroken: (names: string) => string; more: string;
  missing: Record<"instrument" | "direction" | "entry" | "size", string>; example: string;
  noAccount: string; limitTrades: string; error: string; reminder: (days: number) => string;
};

const EXAMPLE = "BTCUSDT long 65000 0.1 stop 64500";

export const T: Record<Lang, Dict> = {
  ru: {
    needLink: "Чтобы пользоваться ботом, подключи аккаунт: на сайте tartib.uk открой «Профиль» → «Telegram» и нажми «Подключить».",
    startHelp: "Привет! Я бот Tartib: помогаю вести журнал сделок и соблюдать свои правила. Я ничего не советую и не торгую за тебя.\n\nЧтобы начать, подключи аккаунт: tartib.uk → «Профиль» → «Telegram».",
    linked: "✅ Аккаунт подключён. Теперь можно записывать сделки сообщением.\n\nПример:\n" + EXAMPLE + "\n\nКоманды: /today, /help",
    codeInvalid: "Код не подошёл или устарел. Получи новый на сайте: «Профиль» → «Telegram».",
    help: "Как записать сделку сообщением:\n" + EXAMPLE + "\n\nМожно добавить: тейк 67000, выход 66000, плечо 5 (или x5), эмоцию (fomo, страх, спокойствие).\n\nКоманды:\n/today — итог дня\n/reminders on|off — напоминания\n/unlink — отключить аккаунт\n\nЯ только веду учёт. Это не инвестиционные рекомендации.",
    unlinked: "Аккаунт отключён. Чтобы подключить снова, получи новый код на сайте.",
    today: (n, f, p) => `Сегодня: сделок ${n}, по правилам ${f}, P&L ${p}.`,
    noTradesToday: "Сегодня сделок ещё нет.",
    remindersOn: "Напоминания включены.", remindersOff: "Напоминания выключены.", remindersUsage: "Напиши /reminders on или /reminders off.",
    saved: (l) => `✅ Записал: ${l}`, rulesOk: "Правила: соблюдены ✓", rulesBroken: (n) => `Правила нарушены: ${n}`, more: "Остальное можно дописать на сайте, в этой сделке.",
    missing: { instrument: "Не понял инструмент (например BTCUSDT).", direction: "Не понял направление: long или short.", entry: "Не понял цену входа.", size: "Не понял объём." },
    example: "Пример:\n" + EXAMPLE,
    noAccount: "У тебя нет торгового счёта. Создай его на сайте.", limitTrades: "Достигнут лимит бесплатного тарифа. Сделку не записал.", error: "Что-то пошло не так. Попробуй ещё раз позже.",
    reminder: (d) => `Ты не записывал сделки уже ${d} дн. Если торговал, внеси их, пока помнишь детали. Выключить напоминания: /reminders off`,
  },
  uz: {
    needLink: "Botdan foydalanish uchun akkauntni ulang: tartib.uk saytida «Profil» → «Telegram» bo'limini ochib, «Ulash» tugmasini bosing.",
    startHelp: "Salom! Men Tartib botiman: bitimlar jurnalini yuritishga va o'z qoidalaringizga rioya qilishga yordam beraman. Men maslahat bermayman va sizning o'rningizga savdo qilmayman.\n\nBoshlash uchun akkauntni ulang: tartib.uk → «Profil» → «Telegram».",
    linked: "✅ Akkaunt ulandi. Endi bitimlarni xabar bilan yozishingiz mumkin.\n\nMisol:\n" + EXAMPLE + "\n\nBuyruqlar: /today, /help",
    codeInvalid: "Kod mos kelmadi yoki eskirgan. Saytdan yangisini oling: «Profil» → «Telegram».",
    help: "Bitimni xabar bilan yozish:\n" + EXAMPLE + "\n\nQo'shish mumkin: take 67000, exit 66000, yelka 5 (yoki x5), hissiyot (fomo, fear, calm).\n\nBuyruqlar:\n/today — kun natijasi\n/reminders on|off — eslatmalar\n/unlink — akkauntni uzish\n\nMen faqat hisob yuritaman. Bu investitsiya tavsiyasi emas.",
    unlinked: "Akkaunt uzildi. Qayta ulash uchun saytdan yangi kod oling.",
    today: (n, f, p) => `Bugun: ${n} ta bitim, qoida bo'yicha ${f} ta, P&L ${p}.`,
    noTradesToday: "Bugun hali bitim yo'q.",
    remindersOn: "Eslatmalar yoqildi.", remindersOff: "Eslatmalar o'chirildi.", remindersUsage: "/reminders on yoki /reminders off deb yozing.",
    saved: (l) => `✅ Yozildi: ${l}`, rulesOk: "Qoidalar: bajarildi ✓", rulesBroken: (n) => `Qoidalar buzildi: ${n}`, more: "Qolganini saytda shu bitimning o'zida to'ldirishingiz mumkin.",
    missing: { instrument: "Instrumentni tushunmadim (masalan BTCUSDT).", direction: "Yo'nalishni tushunmadim: long yoki short.", entry: "Kirish narxini tushunmadim.", size: "Hajmni tushunmadim." },
    example: "Misol:\n" + EXAMPLE,
    noAccount: "Sizda savdo hisobi yo'q. Uni saytda yarating.", limitTrades: "Bepul tarif limitiga yetildi. Bitim yozilmadi.", error: "Nimadir xato ketdi. Keyinroq qayta urinib ko'ring.",
    reminder: (d) => `Siz ${d} kundan beri bitim yozmadingiz. Savdo qilgan bo'lsangiz, tafsilotlar esingizda turganda kiriting. Eslatmalarni o'chirish: /reminders off`,
  },
  en: {
    needLink: "To use the bot, connect your account: on tartib.uk open “Profile” → “Telegram” and press “Connect”.",
    startHelp: "Hi! I'm the Tartib bot: I help you keep a trade journal and follow your own rules. I don't give advice and I don't trade for you.\n\nTo start, connect your account: tartib.uk → “Profile” → “Telegram”.",
    linked: "✅ Account connected. You can now log trades by message.\n\nExample:\n" + EXAMPLE + "\n\nCommands: /today, /help",
    codeInvalid: "The code is wrong or expired. Get a new one on the site: “Profile” → “Telegram”.",
    help: "How to log a trade by message:\n" + EXAMPLE + "\n\nYou can add: tp 67000, exit 66000, leverage 5 (or x5), an emotion (fomo, fear, calm).\n\nCommands:\n/today — today's summary\n/reminders on|off — reminders\n/unlink — disconnect account\n\nI only keep records. This is not investment advice.",
    unlinked: "Account disconnected. To connect again, get a new code on the site.",
    today: (n, f, p) => `Today: ${n} trades, ${f} by the rules, P&L ${p}.`,
    noTradesToday: "No trades yet today.",
    remindersOn: "Reminders are on.", remindersOff: "Reminders are off.", remindersUsage: "Send /reminders on or /reminders off.",
    saved: (l) => `✅ Logged: ${l}`, rulesOk: "Rules: followed ✓", rulesBroken: (n) => `Rules broken: ${n}`, more: "You can add the rest on the site, in this trade.",
    missing: { instrument: "I couldn't find the instrument (e.g. BTCUSDT).", direction: "I couldn't find the direction: long or short.", entry: "I couldn't find the entry price.", size: "I couldn't find the size." },
    example: "Example:\n" + EXAMPLE,
    noAccount: "You have no trading account. Create one on the site.", limitTrades: "Free plan limit reached. The trade was not saved.", error: "Something went wrong. Please try again later.",
    reminder: (d) => `You haven't logged trades for ${d} days. If you traded, add them while you remember the details. Turn reminders off: /reminders off`,
  },
};
