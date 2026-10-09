// Учебные статьи для раздела «Блог». Только образование: без советов что покупать и без обещаний прибыли.
import type { Locale } from "@/lib/i18n/config";

export type Section = { h: string; p: string[] };
export type ArticleText = { title: string; description: string; minutes: number; sections: Section[] };
export type Article = { slug: string; date: string; text: Record<Locale, ArticleText> };

export const ARTICLES: Article[] = [
  {
    slug: "trading-discipline",
    date: "2026-10-09",
    text: {
      ru: {
        title: "Что такое торговая дисциплина и почему она важнее стратегии",
        description: "Простыми словами: что значит торговать по правилам и как измерить цену своих нарушений.",
        minutes: 4,
        sections: [
          { h: "Дисциплина — это выполнение собственных правил", p: ["У большинства трейдеров есть план: где войти, где поставить стоп, сколько рисковать. Дисциплина — это когда сделка совпадает с планом. Не «угадал рынок», а «сделал то, что решил заранее»."] },
          { h: "Почему стратегия без дисциплины не работает", p: ["Даже хорошая стратегия даёт серии убытков. Если после трёх стопов вы двигаете стоп, удваиваете объём или входите «отыграться», вы торгуете уже не своей стратегией, а настроением. Результат тогда нельзя оценить: непонятно, виновата идея или нарушение правил."] },
          { h: "Как измерить цену нарушений", p: ["Отметьте в журнале, какие правила нарушены в каждой сделке. Потом сравните: сколько вы заработали или потеряли в сделках по правилам и сколько в сделках с нарушениями. Разница и есть цена недисциплины в деньгах. Именно её считает функция «Цена дисциплины» в Tartib."] },
          { h: "С чего начать", p: ["Выберите 3–5 простых правил: стоп обязателен, максимум сделок в день, риск на сделку не выше заданного процента. Записывайте каждую сделку и честно отмечайте нарушения. Через месяц у вас будут цифры вместо ощущений."] },
        ],
      },
      uz: {
        title: "Treyding intizomi nima va nega u strategiyadan muhimroq",
        description: "Oddiy tilda: qoidalar bo'yicha savdo qilish nima va buzilishlar narxini qanday o'lchash mumkin.",
        minutes: 4,
        sections: [
          { h: "Intizom — o'z qoidalaringizga amal qilish", p: ["Ko'pchilik treyderlarda reja bor: qayerdan kirish, stopni qayerga qo'yish, qancha xavf qilish. Intizom — bitim rejaga mos kelishi. «Bozorni topdim» emas, «oldindan qaror qilganimni bajardim»."] },
          { h: "Intizomsiz strategiya nega ishlamaydi", p: ["Yaxshi strategiya ham ketma-ket zararlar beradi. Uch stopdan keyin stopni surib qo'ysangiz, hajmni ikki barobar oshirsangiz yoki «qaytarib olish»ga kirsangiz, siz endi strategiyani emas, kayfiyatni savdo qilyapsiz. Natijani baholab bo'lmaydi: g'oya aybdormi yoki qoidalar buzilganmi, noma'lum."] },
          { h: "Buzilishlar narxini qanday o'lchash mumkin", p: ["Jurnalda har bir bitimda qaysi qoidalar buzilganini belgilang. Keyin taqqoslang: qoidaga mos bitimlarda qancha topdingiz yoki yo'qotdingiz, buzilgan bitimlarda qancha. Farq — intizomsizlikning pulda narxi. Tartib'dagi «Intizom narxi» funksiyasi aynan shuni hisoblaydi."] },
          { h: "Qayerdan boshlash kerak", p: ["3–5 ta oddiy qoida tanlang: stop majburiy, kuniga bitimlar soni chegarasi, bitimdagi xavf belgilangan foizdan oshmasligi. Har bir bitimni yozing va buzilishlarni halol belgilang. Bir oydan keyin sezgi o'rniga raqamlaringiz bo'ladi."] },
        ],
      },
      en: {
        title: "What trading discipline is and why it matters more than strategy",
        description: "In plain words: what trading by your rules means and how to measure the cost of breaking them.",
        minutes: 4,
        sections: [
          { h: "Discipline means following your own rules", p: ["Most traders have a plan: where to enter, where to put the stop, how much to risk. Discipline is when the trade matches the plan. Not “I guessed the market” but “I did what I decided in advance”."] },
          { h: "Why a strategy without discipline fails", p: ["Even a good strategy produces losing streaks. If after three stops you move your stop, double your size or jump in to “win it back”, you are trading your mood, not your strategy. The result can no longer be judged: you cannot tell whether the idea or the rule-breaking was at fault."] },
          { h: "How to measure the cost of rule-breaking", p: ["Mark in your journal which rules were broken in each trade. Then compare how much you made or lost in trades that followed the rules and in trades that did not. The difference is the cost of indiscipline in money. That is exactly what the “Price of discipline” feature in Tartib calculates."] },
          { h: "Where to start", p: ["Pick 3–5 simple rules: a stop is mandatory, a maximum number of trades per day, risk per trade no higher than a set percentage. Record every trade and mark violations honestly. After a month you will have numbers instead of impressions."] },
        ],
      },
    },
  },
  {
    slug: "trading-journal",
    date: "2026-10-09",
    text: {
      ru: {
        title: "Как вести журнал сделок: что записывать, чтобы он был полезен",
        description: "Какие поля действительно нужны в журнале трейдера и как по нему находить свои повторяющиеся ошибки.",
        minutes: 4,
        sections: [
          { h: "Зачем журнал", p: ["Память подводит: плохие сделки забываются, а удачные кажутся закономерными. Журнал — это честная запись того, что вы делали и почему."] },
          { h: "Минимум, без которого журнал бесполезен", p: ["Дата и время, инструмент, направление, цена входа, стоп, цена выхода, размер позиции, комиссия и итог. По этим данным можно посчитать результат и долю прибыльных сделок."] },
          { h: "Что превращает журнал в инструмент роста", p: ["Эмоция в момент входа (спокойствие, страх, FOMO, азарт), причина входа, стратегия и отметка о нарушенных правилах. Эти поля показывают, при каком настроении вы теряете деньги и какие правила нарушаете чаще всего."] },
          { h: "Как разбирать записи", p: ["Раз в неделю смотрите три вещи: самые частые нарушения, эмоции в убыточных сделках и дни недели или часы с худшим результатом. Выберите одну проблему и работайте над ней неделю. Не пытайтесь исправить всё сразу."] },
        ],
      },
      uz: {
        title: "Bitimlar jurnalini qanday yuritish: nimalarni yozish kerak",
        description: "Treyder jurnalida qaysi maydonlar haqiqatan kerak va takrorlanuvchi xatolarni qanday topish mumkin.",
        minutes: 4,
        sections: [
          { h: "Jurnal nima uchun kerak", p: ["Xotira aldaydi: yomon bitimlar unutiladi, muvaffaqiyatlilari esa qonuniyatdek tuyuladi. Jurnal — nima qilganingiz va nima uchun qilganingizning halol yozuvi."] },
          { h: "Jurnal foydali bo'lishi uchun minimum", p: ["Sana va vaqt, instrument, yo'nalish, kirish narxi, stop, chiqish narxi, pozitsiya hajmi, komissiya va natija. Shu ma'lumotlar bilan natijani va foydali bitimlar ulushini hisoblash mumkin."] },
          { h: "Jurnalni o'sish vositasiga aylantiradigan narsalar", p: ["Kirish paytidagi his-tuyg'u (xotirjamlik, qo'rquv, FOMO, shijoat), kirish sababi, strategiya va buzilgan qoidalar belgisi. Bu maydonlar qaysi kayfiyatda pul yo'qotishingizni va qaysi qoidalarni ko'proq buzishingizni ko'rsatadi."] },
          { h: "Yozuvlarni qanday tahlil qilish", p: ["Haftada bir marta uch narsaga qarang: eng ko'p buzilgan qoidalar, zararli bitimlardagi his-tuyg'ular va natijasi eng yomon kunlar yoki soatlar. Bitta muammoni tanlab, bir hafta shu ustida ishlang. Hammasini birdan tuzatishga urinmang."] },
        ],
      },
      en: {
        title: "How to keep a trading journal: what to record so it is useful",
        description: "Which fields a trader's journal really needs and how to use it to find your repeating mistakes.",
        minutes: 4,
        sections: [
          { h: "Why keep a journal", p: ["Memory is unreliable: bad trades are forgotten and good ones look inevitable. A journal is an honest record of what you did and why."] },
          { h: "The minimum without which a journal is useless", p: ["Date and time, instrument, direction, entry price, stop, exit price, position size, fees and result. With these you can calculate your result and the share of winning trades."] },
          { h: "What turns a journal into a growth tool", p: ["Your emotion at entry (calm, fear, FOMO, excitement), the reason for entry, the strategy and a mark for broken rules. These fields show in which mood you lose money and which rules you break most often."] },
          { h: "How to review your records", p: ["Once a week look at three things: the most frequent violations, the emotions behind losing trades, and the weekdays or hours with the worst results. Pick one problem and work on it for a week. Do not try to fix everything at once."] },
        ],
      },
    },
  },
  {
    slug: "position-size",
    date: "2026-10-09",
    text: {
      ru: {
        title: "Как рассчитать размер позиции: формула и пример",
        description: "Как заранее знать, сколько вы потеряете, если сделка закроется по стопу, и подобрать объём под этот риск.",
        minutes: 5,
        sections: [
          { h: "Идея: сначала риск, потом объём", p: ["Новички выбирают объём «на глаз», а потом удивляются размеру убытка. Правильный порядок обратный: решаете, сколько готовы потерять в сделке, и уже из этого считаете объём."] },
          { h: "Формула", p: ["Размер позиции = (Депозит × Риск в %) ÷ расстояние от входа до стопа.", "Пример: депозит 5 000, риск 1% — это 50. Вход 100, стоп 98, расстояние 2. Размер = 50 ÷ 2 = 25 единиц. Если цена дойдёт до стопа, убыток составит примерно 50, то есть 1% депозита (без учёта комиссий и проскальзывания)."] },
          { h: "Про плечо", p: ["Плечо не меняет риск, если вы считаете объём по формуле: убыток при стопе всё равно около 50. Плечо лишь определяет, сколько маржи заморозит биржа. Опасность в том, что с большим плечом легко взять объём больше расчётного."] },
          { h: "Что важно помнить", p: ["Комиссии, проскальзывание и гэпы увеличивают реальный убыток. Поэтому многие выбирают небольшой процент риска и фиксируют его правилом. В Tartib калькулятор считает объём и потенциальный убыток до входа в сделку. Это инструмент учёта, а не рекомендация."] },
        ],
      },
      uz: {
        title: "Pozitsiya hajmini qanday hisoblash: formula va misol",
        description: "Bitim stop bo'yicha yopilsa qancha yo'qotishingizni oldindan bilish va hajmni shu xavfga moslash.",
        minutes: 5,
        sections: [
          { h: "G'oya: avval xavf, keyin hajm", p: ["Yangi boshlovchilar hajmni «ko'zda» tanlaydi, keyin zarar kattaligidan hayron bo'ladi. To'g'ri tartib teskari: bitimda qancha yo'qotishga tayyorligingizni belgilaysiz va hajmni shundan hisoblaysiz."] },
          { h: "Formula", p: ["Pozitsiya hajmi = (Depozit × Xavf %) ÷ kirishdan stopgacha masofa.", "Misol: depozit 5 000, xavf 1% — bu 50. Kirish 100, stop 98, masofa 2. Hajm = 50 ÷ 2 = 25 birlik. Narx stopga yetsa, zarar taxminan 50, ya'ni depozitning 1% bo'ladi (komissiya va sirpanishsiz)."] },
          { h: "Yelka haqida", p: ["Hajmni formula bo'yicha hisoblasangiz, yelka xavfni o'zgartirmaydi: stopdagi zarar baribir taxminan 50. Yelka faqat birja qancha marjani muzlatishini belgilaydi. Xavf shundaki, katta yelkada hisoblanganidan katta hajm olish oson."] },
          { h: "Nimani yodda tutish kerak", p: ["Komissiya, sirpanish va gaplar haqiqiy zararni oshiradi. Shuning uchun ko'pchilik xavfning kichik foizini tanlaydi va uni qoida sifatida belgilaydi. Tartib'dagi kalkulyator bitimga kirishdan oldin hajm va mumkin bo'lgan zararni hisoblaydi. Bu hisob vositasi, tavsiya emas."] },
        ],
      },
      en: {
        title: "How to calculate position size: formula and example",
        description: "How to know in advance what you lose if the trade hits your stop, and size the position to that risk.",
        minutes: 5,
        sections: [
          { h: "The idea: risk first, size second", p: ["Beginners pick a size by feel and are then surprised by the loss. The right order is the opposite: decide how much you are willing to lose on the trade, then calculate the size from that."] },
          { h: "The formula", p: ["Position size = (Account × Risk %) ÷ distance from entry to stop.", "Example: account 5,000, risk 1% is 50. Entry 100, stop 98, distance 2. Size = 50 ÷ 2 = 25 units. If price reaches the stop, the loss is about 50, i.e. 1% of the account (before fees and slippage)."] },
          { h: "About leverage", p: ["Leverage does not change the risk if you size by the formula: the loss at the stop is still about 50. Leverage only sets how much margin the exchange locks. The danger is that with high leverage it is easy to take more size than calculated."] },
          { h: "What to remember", p: ["Fees, slippage and gaps increase the real loss. That is why many traders choose a small risk percentage and make it a rule. The calculator in Tartib shows the size and potential loss before you enter. It is a record-keeping tool, not a recommendation."] },
        ],
      },
    },
  },
  {
    slug: "fomo-and-revenge-trading",
    date: "2026-10-09",
    text: {
      ru: {
        title: "FOMO и месть рынку: как эмоции превращаются в убытки",
        description: "Две самые дорогие эмоции трейдера и простые приёмы, которые помогают остановиться вовремя.",
        minutes: 4,
        sections: [
          { h: "FOMO: страх упустить движение", p: ["Цена резко пошла вверх, и появляется мысль «сейчас или никогда». Вход без плана, поздно и с большим объёмом — типичная сделка по FOMO. Обычно стоп оказывается далеко, а вход — на пике эмоций."] },
          { h: "Месть рынку: желание отыграться", p: ["После убытка хочется вернуть деньги как можно быстрее. Объём растёт, правила забываются, следующая сделка открывается без анализа. Так один убыток превращается в серию."] },
          { h: "Приёмы, которые помогают", p: ["Правило «стоп на день»: после убытка в заданный процент депозита торговля заканчивается. Пауза 15 минут после стопа. Чек-лист перед входом из нескольких вопросов. Запись эмоции в журнал перед каждой сделкой."] },
          { h: "Как понять, сколько стоят эмоции", p: ["Отмечайте эмоцию в каждой сделке и раз в неделю сравнивайте результат по эмоциям. Часто видно, что спокойные сделки дают одно, а сделки на азарте и страхе — совсем другое. Эти цифры убеждают лучше любых советов. Tartib показывает такую статистику по эмоциям автоматически."] },
        ],
      },
      uz: {
        title: "FOMO va bozordan o'ch olish: his-tuyg'ular qanday zararga aylanadi",
        description: "Treyderning eng qimmat ikki his-tuyg'usi va o'z vaqtida to'xtashga yordam beradigan oddiy usullar.",
        minutes: 4,
        sections: [
          { h: "FOMO: harakatni o'tkazib yuborish qo'rquvi", p: ["Narx keskin ko'tariladi va «hozir yoki hech qachon» degan fikr paydo bo'ladi. Rejasiz, kech va katta hajm bilan kirish — FOMO bitimining odatiy ko'rinishi. Odatda stop uzoqda bo'ladi, kirish esa his-tuyg'ular cho'qqisida."] },
          { h: "Bozordan o'ch olish: qaytarib olish istagi", p: ["Zarardan keyin pulni imkon qadar tez qaytargingiz keladi. Hajm oshadi, qoidalar unutiladi, keyingi bitim tahlilsiz ochiladi. Shunday qilib bitta zarar ketma-ketlikka aylanadi."] },
          { h: "Yordam beradigan usullar", p: ["«Kunlik stop» qoidasi: depozitning belgilangan foizicha zarardan keyin savdo tugaydi. Stopdan keyin 15 daqiqa tanaffus. Kirishdan oldin bir necha savoldan iborat cheklist. Har bir bitimdan oldin his-tuyg'uni jurnalga yozish."] },
          { h: "His-tuyg'ular qancha turishini qanday bilish mumkin", p: ["Har bir bitimda his-tuyg'uni belgilang va haftada bir marta natijani his-tuyg'ular bo'yicha taqqoslang. Ko'pincha xotirjam bitimlar bir natija, shijoat va qo'rquvdagi bitimlar butunlay boshqa natija berishi ko'rinadi. Bu raqamlar har qanday maslahatdan ishonchliroq. Tartib bunday statistikani avtomatik ko'rsatadi."] },
        ],
      },
      en: {
        title: "FOMO and revenge trading: how emotions turn into losses",
        description: "The two most expensive emotions in trading and simple habits that help you stop in time.",
        minutes: 4,
        sections: [
          { h: "FOMO: fear of missing the move", p: ["Price jumps and the thought “now or never” appears. Entering with no plan, late and with a large size is a typical FOMO trade. The stop usually ends up far away and the entry sits at the peak of emotion."] },
          { h: "Revenge trading: the urge to win it back", p: ["After a loss you want the money back as fast as possible. Size grows, rules are forgotten, the next trade opens with no analysis. One loss turns into a streak."] },
          { h: "Habits that help", p: ["A “stop for the day” rule: after losing a set percentage of the account, trading ends. A 15-minute pause after a stop-out. A short pre-entry checklist. Writing down your emotion before every trade."] },
          { h: "How to see what emotions cost you", p: ["Tag the emotion on each trade and once a week compare results by emotion. Often calm trades give one picture and trades made in excitement or fear a very different one. Those numbers convince better than any advice. Tartib shows this emotion statistics automatically."] },
        ],
      },
    },
  },
];

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
