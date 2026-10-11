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
  {
    "slug": "risk-of-ruin",
    "date": "2026-10-09",
    "text": {
      "ru": {
        "title": "Риск разорения: почему размер риска важнее точки входа",
        "description": "Как маленький процент риска на сделку защищает депозит от серий убытков и что показывает расчёт вероятностей.",
        "minutes": 5,
        "sections": [
          {
            "h": "Серии убытков неизбежны",
            "p": [
              "Даже у рабочей стратегии бывают серии убытков подряд. Если доля прибыльных сделок 45%, вероятность убытка в каждой сделке 55%. Вероятность, что пять конкретных сделок подряд окажутся убыточными, равна 0,55 в пятой степени, то есть около 5%. За сотню сделок такие серии встречаются заметно чаще, чем кажется."
            ]
          },
          {
            "h": "Что серия делает с депозитом",
            "p": [
              "При риске 1% на сделку десять убытков подряд уменьшают депозит примерно на 9,6%. При риске 10% те же десять убытков съедают около 65% депозита. Серия одинаковая, разница только в размере риска. Поэтому процент риска решает, переживёт ли счёт неудачную полосу."
            ]
          },
          {
            "h": "Почему возвращаться тяжелее, чем терять",
            "p": [
              "После просадки на 50% нужно удвоить остаток депозита, чтобы вернуться к началу. После просадки на 20% нужно 25%. Чем глубже яма, тем длиннее путь назад, поэтому важно не заходить в глубокую просадку. Калькулятор «Восстановление после просадки» в Tartib показывает это для любого процента."
            ]
          },
          {
            "h": "Как этим пользоваться",
            "p": [
              "Калькулятор «Риск разорения» в Tartib оценивает вероятность когда-либо потерять выбранную долю депозита при заданных проценте прибыльных сделок, отношении прибыли к риску и риске на сделку. Это упрощённая модель независимых сделок: она не прогноз, а способ увидеть, как сильно размер риска влияет на устойчивость счёта."
            ]
          }
        ]
      },
      "uz": {
        "title": "Vayron bo'lish xavfi: nega risk hajmi kirish nuqtasidan muhimroq",
        "description": "Bitimga kichik risk foizi depozitni ketma-ket zararlardan qanday himoya qiladi va ehtimollar hisobi nimani ko'rsatadi.",
        "minutes": 5,
        "sections": [
          {
            "h": "Zararlar seriyasi muqarrar",
            "p": [
              "Ishlaydigan strategiyada ham ketma-ket zararlar bo'ladi. Foydali bitimlar ulushi 45% bo'lsa, har bir bitimning zarar bilan tugash ehtimoli 55%. Aniq beshta bitimning ketma-ket zararli bo'lish ehtimoli 0,55 ning beshinchi darajasi, ya'ni taxminan 5%. Yuzlab bitimda bunday seriyalar ko'rinadiganidan ancha tez-tez uchraydi."
            ]
          },
          {
            "h": "Seriya depozitga nima qiladi",
            "p": [
              "Bitimga 1% risk bilan ketma-ket o'nta zarar depozitni taxminan 9,6% ga kamaytiradi. 10% risk bilan xuddi shu o'nta zarar depozitning taxminan 65% ini yeydi. Seriya bir xil, farq faqat risk hajmida. Shuning uchun risk foizi hisob omadsiz davrdan omon qolishini belgilaydi."
            ]
          },
          {
            "h": "Nega qaytish yo'qotishdan qiyinroq",
            "p": [
              "50% cho'kishdan keyin boshlang'ich darajaga qaytish uchun qolgan summani ikki barobar oshirish kerak. 20% cho'kishdan keyin 25% kerak. Chuqurlik qancha katta bo'lsa, qaytish yo'li shuncha uzun, shuning uchun chuqur cho'kishga kirmaslik muhim. Tartib dagi «Cho'kishdan tiklanish» kalkulyatori buni istalgan foiz uchun ko'rsatadi."
            ]
          },
          {
            "h": "Bundan qanday foydalanish",
            "p": [
              "Tartib dagi «Vayron bo'lish xavfi» kalkulyatori foydali bitimlar foizi, foyda/risk nisbati va bitimga risk berilganda depozitning tanlangan ulushini qachondir yo'qotish ehtimolini baholaydi. Bu mustaqil bitimlarning soddalashtirilgan modeli: bashorat emas, risk hajmi hisob barqarorligiga qanchalik ta'sir qilishini ko'rish usuli."
            ]
          }
        ]
      },
      "en": {
        "title": "Risk of ruin: why position risk matters more than entries",
        "description": "How a small risk per trade protects an account from losing streaks, and what the probability maths actually shows.",
        "minutes": 5,
        "sections": [
          {
            "h": "Losing streaks are unavoidable",
            "p": [
              "Even a working strategy has runs of losses in a row. With a 45% win rate each trade has a 55% chance of losing. The chance that five specific trades in a row all lose is 0.55 to the fifth power, about 5%. Over a hundred trades such runs appear far more often than most people expect."
            ]
          },
          {
            "h": "What a streak does to the account",
            "p": [
              "At 1% risk per trade, ten losses in a row cut the account by about 9.6%. At 10% risk the same ten losses take about 65% of it. The streak is identical; only the risk size differs. That is why risk per trade decides whether an account survives a bad stretch."
            ]
          },
          {
            "h": "Why getting back is harder than losing",
            "p": [
              "After a 50% drawdown you need to double what is left to get back to the start. After a 20% drawdown you need 25%. The deeper the hole, the longer the way back, so avoiding deep drawdowns matters. The Drawdown recovery calculator in Tartib shows this for any percentage."
            ]
          },
          {
            "h": "How to use this",
            "p": [
              "The Risk of ruin calculator in Tartib estimates the probability of ever losing a chosen share of the account for a given win rate, reward-to-risk ratio and risk per trade. It is a simplified model of independent trades: not a forecast, but a way to see how strongly risk size affects the survival of an account."
            ]
          }
        ]
      }
    }
  },
  {
    "slug": "trading-diary",
    "date": "2026-10-09",
    "text": {
      "ru": {
        "title": "Дневник трейдера: как вести записи, которые действительно помогают",
        "description": "Простая система из утреннего плана и вечернего итога, которая занимает несколько минут в день.",
        "minutes": 4,
        "sections": [
          {
            "h": "Зачем нужен дневник, если есть журнал сделок",
            "p": [
              "Журнал сделок хранит цифры: вход, выход, результат. Дневник хранит контекст: в каком состоянии вы торговали, что планировали и что из этого сделали. Именно контекст объясняет, почему при одной и той же стратегии одни дни выходят в плюс, а другие нет."
            ]
          },
          {
            "h": "Утром: план и состояние",
            "p": [
              "Перед торговлей запишите план на день: что торгуете, где готовы входить, при каких условиях остановитесь. Отметьте настроение и энергию по шкале от 1 до 5. Если вы устали или раздражены, это повод снизить размер или не торговать вовсе. Запись занимает две минуты."
            ]
          },
          {
            "h": "Вечером: итог и один урок",
            "p": [
              "В конце дня напишите, что получилось и что нет, и честно отметьте, следовали ли вы плану. Затем одним предложением сформулируйте урок дня. Один короткий урок запоминается лучше длинного разбора, а через месяц из них складывается ваш личный список правил."
            ]
          },
          {
            "h": "Раз в неделю: ищем закономерности",
            "p": [
              "Просмотрите записи за неделю. Сравните результат в дни, когда план соблюдён и когда нет, и в дни с разным настроением. В разделе «Дневник» Tartib это считается автоматически. Это наблюдения, а не доказательства причины, но они подсказывают, какие правила стоит добавить."
            ]
          }
        ]
      },
      "uz": {
        "title": "Treyder kundaligi: haqiqatan yordam beradigan yozuvlarni qanday yuritish",
        "description": "Ertalabki reja va kechki natijadan iborat, kuniga bir necha daqiqa oladigan oddiy tizim.",
        "minutes": 4,
        "sections": [
          {
            "h": "Bitimlar jurnali bo'lsa, kundalik nega kerak",
            "p": [
              "Bitimlar jurnali raqamlarni saqlaydi: kirish, chiqish, natija. Kundalik kontekstni saqlaydi: qaysi holatda savdo qildingiz, nimani rejalashtirdingiz va shundan nimani bajardingiz. Aynan kontekst bir xil strategiyada nega ba'zi kunlar foydada, ba'zilari yo'qligini tushuntiradi."
            ]
          },
          {
            "h": "Ertalab: reja va holat",
            "p": [
              "Savdodan oldin kun rejasini yozing: nimani savdo qilasiz, qayerda kirishga tayyorsiz, qanday sharoitda to'xtaysiz. Kayfiyat va energiyani 1 dan 5 gacha shkalada belgilang. Charchagan yoki asabiy bo'lsangiz, hajmni kamaytirish yoki savdo qilmaslik uchun sabab. Yozuv ikki daqiqa oladi."
            ]
          },
          {
            "h": "Kechqurun: natija va bitta saboq",
            "p": [
              "Kun oxirida nima bo'ldi va nima bo'lmaganini yozing, rejaga amal qilgan-qilmaganingizni halol belgilang. So'ng kun saboqini bitta gap bilan ifodalang. Qisqa saboq uzun tahlildan yaxshiroq eslab qolinadi, bir oydan keyin ulardan shaxsiy qoidalar ro'yxati paydo bo'ladi."
            ]
          },
          {
            "h": "Haftada bir marta: qonuniyatlarni qidiramiz",
            "p": [
              "Hafta yozuvlarini ko'rib chiqing. Reja bajarilgan va bajarilmagan kunlar hamda turli kayfiyatdagi kunlar natijasini taqqoslang. Tartib dagi «Kundalik» bo'limida bu avtomatik hisoblanadi. Bu kuzatuvlar, sabab isboti emas, lekin qaysi qoidalarni qo'shish kerakligini ko'rsatadi."
            ]
          }
        ]
      },
      "en": {
        "title": "The trader's diary: how to keep notes that actually help",
        "description": "A simple system of a morning plan and an evening review that takes a few minutes a day.",
        "minutes": 4,
        "sections": [
          {
            "h": "Why a diary if you already have a trade journal",
            "p": [
              "A trade journal stores numbers: entry, exit, result. A diary stores context: what state you traded in, what you planned and how much of it you did. Context explains why the same strategy gives good days and bad days."
            ]
          },
          {
            "h": "Morning: plan and state",
            "p": [
              "Before trading, write the plan for the day: what you trade, where you are ready to enter, and under what conditions you stop. Rate your mood and energy from 1 to 5. If you are tired or irritated, that is a reason to cut size or skip trading. It takes two minutes."
            ]
          },
          {
            "h": "Evening: result and one lesson",
            "p": [
              "At the end of the day write what worked and what did not, and mark honestly whether you followed the plan. Then put the lesson of the day in one sentence. One short lesson is remembered better than a long analysis, and after a month they form your personal list of rules."
            ]
          },
          {
            "h": "Weekly: look for patterns",
            "p": [
              "Read through the week. Compare results on days you followed the plan and days you did not, and on days with different moods. The Diary section in Tartib calculates this automatically. These are observations, not proof of cause, but they hint at which rules to add."
            ]
          }
        ]
      }
    }
  },
  {
    "slug": "kelly-and-leverage",
    "date": "2026-10-09",
    "text": {
      "ru": {
        "title": "Критерий Келли и плечо: что на самом деле показывает математика",
        "description": "Формула Келли, почему полный Келли слишком агрессивен и чем плечо отличается от риска.",
        "minutes": 5,
        "sections": [
          {
            "h": "Формула Келли",
            "p": [
              "Критерий Келли отвечает на вопрос, какую долю капитала математически выгодно рисковать, если известны доля прибыльных сделок p и отношение прибыли к риску b. Формула: f = p − (1 − p) / b. При p = 50% и b = 2 получается 0,5 − 0,25 = 25%. Если результат отрицательный, у системы нет преимущества, и рисковать нечем."
            ]
          },
          {
            "h": "Почему полный Келли слишком агрессивен",
            "p": [
              "Формула предполагает точное знание p и b, а в реальности они оценены по ограниченному числу сделок и меняются. Ошибка в оценке сильно увеличивает просадки. Поэтому на практике используют половину или четверть значения. Калькулятор «Критерий Келли» в Tartib показывает все три варианта."
            ]
          },
          {
            "h": "Плечо не равно риску",
            "p": [
              "Плечо определяет, сколько собственных денег блокируется под позицию, а риск определяется расстоянием до стопа и размером позиции. Если размер считать по формуле, убыток на стопе одинаков при плече 2 и плече 20. Опасность плеча в другом: при высоком плече цена ликвидации находится близко, и обычное колебание может закрыть позицию раньше стопа."
            ]
          },
          {
            "h": "Как проверить свои цифры",
            "p": [
              "Калькуляторы «Цена ликвидации» и «Маржа и плечо» в Tartib показывают приблизительные значения; точную цену ликвидации всегда сверяйте с биржей. А в расширенной аналитике Tartib считаются ваши собственные Келли и риск разорения по фактическим сделкам. Это справочная математика, а не рекомендация."
            ]
          }
        ]
      },
      "uz": {
        "title": "Kelli mezoni va yelka: matematika aslida nimani ko'rsatadi",
        "description": "Kelli formulasi, nega to'liq Kelli juda agressiv va yelka riskdan nimasi bilan farq qiladi.",
        "minutes": 5,
        "sections": [
          {
            "h": "Kelli formulasi",
            "p": [
              "Kelli mezoni foydali bitimlar ulushi p va foyda/risk nisbati b ma'lum bo'lganda kapitalning qancha ulushini xavf ostiga qo'yish matematik jihatdan foydali ekanini aytadi. Formula: f = p − (1 − p) / b. p = 50% va b = 2 bo'lsa, 0,5 − 0,25 = 25% chiqadi. Natija manfiy bo'lsa, tizimda ustunlik yo'q va xavf ostiga qo'yadigan narsa yo'q."
            ]
          },
          {
            "h": "Nega to'liq Kelli juda agressiv",
            "p": [
              "Formula p va b ni aniq bilishni nazarda tutadi, amalda esa ular cheklangan bitimlar bo'yicha baholanadi va o'zgarib turadi. Baholashdagi xato cho'kishlarni ancha oshiradi. Shuning uchun amalda qiymatning yarmi yoki choragi ishlatiladi. Tartib dagi «Kelli mezoni» kalkulyatori uchala variantni ko'rsatadi."
            ]
          },
          {
            "h": "Yelka riskka teng emas",
            "p": [
              "Yelka pozitsiya uchun qancha o'z pulingiz bloklanishini belgilaydi, risk esa stopgacha masofa va pozitsiya hajmi bilan aniqlanadi. Hajm formula bo'yicha hisoblansa, stopdagi zarar 2 yelkada ham, 20 yelkada ham bir xil. Yelka xavfi boshqa joyda: yuqori yelkada likvidatsiya narxi yaqin bo'ladi va oddiy tebranish pozitsiyani stopdan oldin yopib qo'yishi mumkin."
            ]
          },
          {
            "h": "O'z raqamlaringizni qanday tekshirish",
            "p": [
              "Tartib dagi «Likvidatsiya narxi» va «Marja va yelka» kalkulyatorlari taxminiy qiymatlarni ko'rsatadi; aniq likvidatsiya narxini doim birja bilan solishtiring. Tartib ning kengaytirilgan tahlilida esa haqiqiy bitimlaringiz bo'yicha shaxsiy Kelli va vayron bo'lish xavfi hisoblanadi. Bu ma'lumot beruvchi matematika, tavsiya emas."
            ]
          }
        ]
      },
      "en": {
        "title": "Kelly criterion and leverage: what the maths really says",
        "description": "The Kelly formula, why full Kelly is too aggressive, and how leverage differs from risk.",
        "minutes": 5,
        "sections": [
          {
            "h": "The Kelly formula",
            "p": [
              "The Kelly criterion answers what share of capital is mathematically worth risking when you know the win rate p and the reward-to-risk ratio b. The formula is f = p − (1 − p) / b. With p = 50% and b = 2 you get 0.5 − 0.25 = 25%. If the result is negative the system has no edge and there is nothing to risk."
            ]
          },
          {
            "h": "Why full Kelly is too aggressive",
            "p": [
              "The formula assumes you know p and b exactly, while in reality they are estimated from a limited number of trades and change over time. An error in the estimate increases drawdowns a lot. That is why practitioners use half or a quarter of the value. The Kelly criterion calculator in Tartib shows all three."
            ]
          },
          {
            "h": "Leverage is not risk",
            "p": [
              "Leverage sets how much of your own money is locked for a position, while risk is set by the distance to the stop and the position size. If size is calculated by formula, the loss at the stop is the same at 2x and at 20x. The danger of leverage is different: at high leverage the liquidation price is close, and ordinary price noise can close the position before your stop."
            ]
          },
          {
            "h": "How to check your own numbers",
            "p": [
              "The Liquidation price and Margin and leverage calculators in Tartib show approximate values; always confirm the exact liquidation price on your exchange. The advanced analytics in Tartib also calculate your own Kelly and risk of ruin from your actual trades. This is reference maths, not a recommendation."
            ]
          }
        ]
      }
    }
  },
  {
    slug: "nasdaq-sessions-pdt-risk",
    date: "2026-10-11",
    text: {
      ru: {
        title: "Nasdaq для трейдера: сессии, правило PDT и риск на акциях и фьючерсах",
        description: "Часы американской биржи, что такое дей-трейд и правило PDT, как считать размер позиции в акциях и контрактах.",
        minutes: 6,
        sections: [
          { h: "Три части торгового дня", p: ["Американские акции торгуются по Нью-Йорку: премаркет с 4:00 до 9:30, основная сессия с 9:30 до 16:00, постмаркет с 16:00 до 20:00. В премаркете и постмаркете объёмов меньше, спреды шире, цены двигаются резче. Раз в год часы меняются из-за перехода на летнее время, поэтому в Tartib время показывается в вашем часовом поясе и пересчитывается само.", "В праздники биржа закрыта, а в некоторые дни, например на следующий день после Дня благодарения, основная сессия заканчивается в 13:00. Смотрите календарь биржи заранее."] },
          { h: "Не все часы одинаково полезны именно вам", p: ["Первые 30 минут после открытия и последний час обычно самые подвижные, середина дня тише. У каждого трейдера свои сильные и слабые часы. Не угадывайте, а измерьте: в разделе расширенной статистики Tartib результат по сделкам на акциях и фьючерсах разложен по часам биржи вместе с долей нарушений правил. Может оказаться, что в первые полчаса вы чаще нарушаете правила, чем днём."] },
          { h: "Что такое дей-трейд и правило PDT", p: ["Дей-трейд — сделка по акции, открытая и закрытая в один и тот же торговый день. По правилу FINRA, если на маржинальном счёте у вас меньше 25 000 долларов и вы сделали 4 или более дей-трейдов за 5 торговых дней, брокер может присвоить вам статус «шаблонного дей-трейдера» и ограничить торговлю. Правило относится к акциям; условия у разных брокеров и в разное время могут отличаться, поэтому всегда уточняйте их у своего брокера.", "Tartib ведёт справочный счётчик по вашим сделкам с рынком «Акции» и показывает, сколько дей-трейдов уже использовано. Он считает только то, что записано в журнале."] },
          { h: "Размер позиции в акциях", p: ["Акции покупают целыми штуками. Формула простая: сколько вы готовы потерять на сделке, делим на расстояние от входа до стопа с учётом комиссии. Результат округляем вниз. Пример: баланс 10 000 долларов, риск 1%, вход 180, стоп 176: риск 100 долларов, 4 доллара на акцию, значит 25 акций.", "Если стоимость позиции получилась больше баланса, нужно плечо брокера. Это сигнал уменьшить размер, а не повод брать больше."] },
          { h: "Фьючерсы: считайте в пунктах", p: ["У фьючерса на Nasdaq-100 один пункт стоит денег: у NQ 20 долларов, у микро-контракта MNQ 2 доллара; у ES 50 долларов, у MES 5. Стоп в 20 пунктов на одном MNQ равен 40 долларам, на одном NQ равен 400. Калькулятор «Риск по фьючерсам» считает число контрактов и подсказывает размер для формы сделки: контракты умножить на стоимость пункта.", "Для начала микро-контракты дают возможность рисковать малыми суммами и точнее дозировать риск."] },
          { h: "Главное", p: ["Сессии, PDT и размер позиции нужны не для поиска идеальных входов, а для контроля риска. Заранее решите, в какие часы торгуете, сколько дей-трейдов себе разрешаете и какой размер подходит под стоп, а потом проверяйте себя по журналу. Tartib — инструмент учёта и дисциплины; он не даёт советов и не обещает прибыли."] },
        ],
      },
      uz: {
        title: "Nasdaq treyderi uchun: sessiyalar, PDT qoidasi va aksiya hamda fyucherslarda risk",
        description: "AQSh birjasi soatlari, day-trade va PDT qoidasi nima, aksiya va kontraktlarda pozitsiya hajmini qanday hisoblash.",
        minutes: 6,
        sections: [
          { h: "Savdo kunining uch qismi", p: ["AQSh aksiyalari Nyu-York vaqti bilan savdo qilinadi: premarket 4:00 dan 9:30 gacha, asosiy sessiya 9:30 dan 16:00 gacha, postmarket 16:00 dan 20:00 gacha. Premarket va postmarketda hajm kam, spred keng, narx keskinroq harakatlanadi. Yilda ikki marta yozgi vaqtga o'tish sababli soatlar o'zgaradi, shuning uchun Tartib vaqtni sizning mintaqangizda ko'rsatadi va o'zi qayta hisoblaydi.", "Bayramlarda birja yopiq, ba'zi kunlarda, masalan Minnatdorchilik kunidan keyingi kuni, asosiy sessiya 13:00 da tugaydi. Birja kalendariga oldindan qarang."] },
          { h: "Barcha soatlar sizga bir xil foydali emas", p: ["Ochilishdan keyingi dastlabki 30 daqiqa va oxirgi soat odatda eng harakatchan, kun o'rtasi tinchroq. Har bir treyderning o'z kuchli va kuchsiz soatlari bor. Taxmin qilmang, o'lchang: Tartibning kengaytirilgan statistikasida aksiya va fyuchers bitimlari natijasi birja soatlari bo'yicha, qoidalar buzilishi ulushi bilan birga ko'rsatiladi. Dastlabki yarim soatda kunning o'rtasidagidan ko'ra tez-tez qoidani buzishingiz mumkin."] },
          { h: "Day-trade va PDT qoidasi nima", p: ["Day-trade — aksiya bo'yicha bir savdo kunida ochilib yopilgan bitim. FINRA qoidasiga ko'ra, marja hisobingizda 25 000 dollardan kam bo'lsa va 5 savdo kuni ichida 4 yoki undan ko'p day-trade qilsangiz, broker sizga «pattern day trader» maqomini berib, savdoni cheklashi mumkin. Qoida aksiyalarga tegishli; brokerlarda va turli vaqtda shartlar farq qilishi mumkin, shuning uchun doim brokeringizdan aniqlang.", "Tartib «Aksiyalar» bozoridagi bitimlaringiz bo'yicha ma'lumot uchun hisoblagich yuritadi va nechta day-trade ishlatilganini ko'rsatadi. U faqat jurnalga yozilganlarni sanaydi."] },
          { h: "Aksiyalarda pozitsiya hajmi", p: ["Aksiyalar butun donada olinadi. Formula oddiy: bitimda qancha yo'qotishga tayyorligingizni kirishdan stopgacha masofaga (komissiya bilan) bo'lamiz. Natijani pastga yaxlitlaymiz. Misol: balans 10 000 dollar, risk 1%, kirish 180, stop 176: risk 100 dollar, aksiyaga 4 dollar, demak 25 ta aksiya.", "Pozitsiya qiymati balansdan oshib ketsa, broker yelkasi kerak. Bu hajmni kamaytirish signali, ko'proq olish sababi emas."] },
          { h: "Fyucherslar: punktlarda hisoblang", p: ["Nasdaq-100 fyuchersida bir punkt pul turadi: NQ da 20 dollar, mikro MNQ da 2 dollar; ES da 50 dollar, MES da 5. Bitta MNQ da 20 punktlik stop 40 dollar, bitta NQ da 400 dollar. «Fyuchers riski» kalkulyatori kontraktlar sonini hisoblaydi va bitim formasi uchun hajmni aytadi: kontraktlar ko'paytirilgan punkt qiymati.", "Boshlash uchun mikro-kontraktlar kichik summalar bilan risk qilish va riskni aniqroq o'lchash imkonini beradi."] },
          { h: "Asosiysi", p: ["Sessiyalar, PDT va pozitsiya hajmi ideal kirishni qidirish uchun emas, riskni nazorat qilish uchun kerak. Qaysi soatlarda savdo qilishni, nechta day-trade ruxsat berishni va stopga qanday hajm mosligini oldindan hal qiling, keyin o'zingizni jurnal bo'yicha tekshiring. Tartib — hisob va intizom vositasi; maslahat bermaydi va foyda va'da qilmaydi."] },
        ],
      },
      en: {
        title: "Nasdaq for traders: sessions, the PDT rule and risk on stocks and futures",
        description: "US market hours, what a day trade and the PDT rule are, and how to size positions in shares and contracts.",
        minutes: 6,
        sections: [
          { h: "Three parts of the trading day", p: ["US stocks trade on New York time: pre-market from 4:00 to 9:30, the regular session from 9:30 to 16:00 and after-hours from 16:00 to 20:00. Pre-market and after-hours have thinner volume, wider spreads and sharper moves. The clocks shift with daylight saving, so Tartib shows times in your own time zone and recalculates them for you.", "The exchange is closed on holidays, and on a few days, such as the day after Thanksgiving, the regular session ends at 13:00. Check the exchange calendar ahead of time."] },
          { h: "Not every hour suits you equally", p: ["The first 30 minutes after the open and the last hour are usually the most active, the middle of the day is quieter. Every trader has their own strong and weak hours. Do not guess, measure: in Tartib's advanced statistics, results for stock and futures trades are split by exchange hours together with the share of rule breaks. You may find you break rules more often in the first half hour than at midday."] },
          { h: "What a day trade is and what PDT means", p: ["A day trade is a stock position opened and closed on the same trading day. Under the FINRA rule, if a margin account holds less than 25,000 dollars and makes 4 or more day trades within 5 trading days, the broker may label you a pattern day trader and restrict trading. The rule concerns stocks; terms can differ between brokers and change over time, so always confirm them with your broker.", "Tartib keeps a reference counter from your trades in the Stocks market and shows how many day trades you have used. It only counts what is recorded in your journal."] },
          { h: "Position size in stocks", p: ["Shares are bought in whole units. The formula is simple: the amount you are willing to lose on the trade, divided by the distance from entry to stop including commission. Round the result down. Example: a 10,000 dollar balance, 1% risk, entry 180, stop 176: 100 dollars of risk, 4 dollars per share, so 25 shares.", "If the position value comes out larger than your balance, you would need broker leverage. That is a sign to cut the size, not a reason to take more."] },
          { h: "Futures: count in points", p: ["On Nasdaq-100 futures one point is worth money: 20 dollars on NQ, 2 dollars on the micro MNQ; 50 dollars on ES, 5 on MES. A 20-point stop on one MNQ is 40 dollars, on one NQ it is 400. The Futures risk calculator works out the number of contracts and gives the size to enter in the trade form: contracts multiplied by the point value.", "To start, micro contracts let you risk small amounts and size risk more precisely."] },
          { h: "The bottom line", p: ["Sessions, PDT and position size are for controlling risk, not for finding perfect entries. Decide in advance which hours you trade, how many day trades you allow yourself and what size fits your stop, then check yourself against your journal. Tartib is a tool for tracking and discipline; it gives no advice and promises no profit."] },
        ],
      },
    },
  },
];

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}
