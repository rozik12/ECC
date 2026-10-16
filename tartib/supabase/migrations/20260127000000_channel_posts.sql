-- Ежедневные посты в Telegram-канал Tartib: очередь текстов и ежедневная отправка через бота прямо из базы.
-- Работает только когда в bot_config задан ключ channel_id (например @tartib_channel). Пока ключа нет, ничего не отправляется.
create table public.channel_posts (
  id integer primary key,
  body text not null,
  sent_at timestamptz,
  request_id bigint
);
alter table public.channel_posts enable row level security;
revoke all on public.channel_posts from anon, authenticated;

insert into public.channel_posts (id, body) values
  (1, $post$Риск на сделку: 1% — это сколько?

Баланс 5000 $, риск 1% — это 50 $. Если стоп стоит дальше, размер позиции уменьшается, а не риск растёт. Сначала решаем, сколько готовы потерять, потом считаем объём.

Bitimdagi risk: 1% qancha?

Balans 5000 $, risk 1% — bu 50 $. Stop uzoqroq bo'lsa, risk emas, pozitsiya hajmi kamayadi. Avval qancha yo'qotishga tayyorligimizni hal qilamiz, keyin hajmni hisoblaymiz.

https://tartib.uk/tools/position-size

Tartib — инструмент учёта и дисциплины. Не инвестиционная рекомендация.
Tartib — hisob va intizom vositasi. Investitsiya tavsiyasi emas.$post$),
  (2, $post$Риск к прибыли 1:2

При соотношении 1:2 и всего 40% прибыльных сделок результат всё ещё в плюсе: 0,4 × 2 − 0,6 × 1 = +0,2 риска на сделку (до комиссий). Но реальные сделки считайте по своему журналу, а не по примеру.

Risk va foyda 1:2

1:2 nisbatda va atigi 40% foydali bitim bilan ham natija plyusda: 0,4 × 2 − 0,6 × 1 = bitimga +0,2 risk (komissiyalargacha). Haqiqiy bitimlarni misol bo'yicha emas, o'z jurnalingiz bo'yicha hisoblang.

https://tartib.uk/tools/risk-reward

Tartib — инструмент учёта и дисциплины. Не инвестиционная рекомендация.
Tartib — hisob va intizom vositasi. Investitsiya tavsiyasi emas.$post$),
  (3, $post$10 убытков подряд

При риске 1% на сделку десять убытков подряд дают просадку около 9,6%. При риске 5% — уже около 40%. Серия убытков случается у всех, вопрос только в том, переживёт ли её ваш счёт.

Ketma-ket 10 ta zarar

Bitimga 1% risk bilan ketma-ket o'nta zarar taxminan 9,6% prosadka beradi. 5% risk bilan esa taxminan 40%. Zararlar seriyasi hammada bo'ladi, savol faqat hisobingiz unga bardosh beradimi.

https://tartib.uk/tools/loss-streak

Tartib — инструмент учёта и дисциплины. Не инвестиционная рекомендация.
Tartib — hisob va intizom vositasi. Investitsiya tavsiyasi emas.$post$),
  (4, $post$Минус 50% требует плюс 100%

Просадка и восстановление несимметричны: после −20% нужно +25%, после −50% нужно +100%. Поэтому контроль просадки важнее погони за доходностью.

−50% uchun +100% kerak

Prosadka va tiklanish simmetrik emas: −20% dan keyin +25%, −50% dan keyin +100% kerak. Shuning uchun foyda quvishdan ko'ra prosadkani nazorat qilish muhimroq.

https://tartib.uk/tools/drawdown-recovery

Tartib — инструмент учёта и дисциплины. Не инвестиционная рекомендация.
Tartib — hisob va intizom vositasi. Investitsiya tavsiyasi emas.$post$),
  (5, $post$Золото: размер позиции в лотах

У большинства брокеров лот золота — 100 унций, и каждый 1 $ движения цены стоит 100 $ на лот. Вход 4200, стоп 4190, риск 50 $ — это 0,05 лота. Проверяйте спецификацию своего брокера.

Oltin: lotlarda pozitsiya hajmi

Ko'pchilik brokerlarda oltin loti — 100 untsiya, narxning har 1 $ harakati lotga 100 $ turadi. Kirish 4200, stop 4190, risk 50 $ — bu 0,05 lot. Broker spetsifikatsiyasini tekshiring.

https://tartib.uk/tools/metals-lot

Tartib — инструмент учёта и дисциплины. Не инвестиционная рекомендация.
Tartib — hisob va intizom vositasi. Investitsiya tavsiyasi emas.$post$),
  (6, $post$Журнал сделок: что записывать

Кроме цены входа и выхода запишите причину входа, своё состояние и нарушили ли вы правила. Через месяц журнал покажет, где вы теряете деньги, а не только сколько.

Bitimlar jurnali: nimani yozish

Kirish va chiqish narxidan tashqari kirish sababi, holatingiz va qoidalarni buzgan-buzmaganingizni yozing. Bir oydan keyin jurnal qancha emas, qayerda pul yo'qotayotganingizni ko'rsatadi.

https://tartib.uk/blog/trading-journal

Tartib — инструмент учёта и дисциплины. Не инвестиционная рекомендация.
Tartib — hisob va intizom vositasi. Investitsiya tavsiyasi emas.$post$),
  (7, $post$Реванш после убытка

Самые дорогие сделки часто идут сразу после убытка: хочется «отыграться». Простое правило — пауза 30 минут после убыточной сделки. Поставьте её в правила и проверяйте по журналу.

Zarardan keyingi qasos

Eng qimmat bitimlar ko'pincha zarardan keyin darrov bo'ladi: «qaytarib olgisi» keladi. Oddiy qoida — zararli bitimdan keyin 30 daqiqa tanaffus. Uni qoidalarga qo'shing va jurnal bo'yicha tekshiring.

https://tartib.uk/blog/fomo-and-revenge-trading

Tartib — инструмент учёта и дисциплины. Не инвестиционная рекомендация.
Tartib — hisob va intizom vositasi. Investitsiya tavsiyasi emas.$post$),
  (8, $post$Физическое золото: наценка

Слитки и монеты продают с наценкой над биржей, а скупают ниже. Если заплатили 4450 $ за унцию при бирже 4200 $ и дилер выкупает с дисконтом 2%, для нуля нужен рост цены примерно до 4540 $.

Jismoniy oltin: ustama

Quyma va tangalar birjadan ustama bilan sotiladi, arzonroq sotib olinadi. Birjada 4200 $ turganda untsiya uchun 4450 $ to'lagan va diler 2% chegirma bilan sotib olsa, nolga chiqish uchun narx taxminan 4540 $ gacha o'sishi kerak.

https://tartib.uk/tools/bullion-breakeven

Tartib — инструмент учёта и дисциплины. Не инвестиционная рекомендация.
Tartib — hisob va intizom vositasi. Investitsiya tavsiyasi emas.$post$),
  (9, $post$Плечо и цена ликвидации

Плечо не увеличивает риск, если размер позиции задан стопом. Но высокое плечо приближает цену ликвидации. Заранее посчитайте, где она, и держите стоп ближе.

Yelka va likvidatsiya narxi

Pozitsiya hajmi stop bilan belgilansa, yelka riskni oshirmaydi. Lekin yuqori yelka likvidatsiya narxini yaqinlashtiradi. Uni oldindan hisoblang va stopni yaqinroq qo'ying.

https://tartib.uk/tools/liquidation

Tartib — инструмент учёта и дисциплины. Не инвестиционная рекомендация.
Tartib — hisob va intizom vositasi. Investitsiya tavsiyasi emas.$post$),
  (10, $post$Комиссии съедают результат

Сделки с маленьким ходом особенно чувствительны к комиссии: при частой торговле она может составить большую часть результата. Посчитайте, при каком движении цены сделка выходит в ноль.

Komissiyalar natijani yeydi

Kichik harakatli bitimlar komissiyaga sezgir: tez-tez savdoda u natijaning katta qismini tashkil qilishi mumkin. Narx qancha harakatlanganda bitim nolga chiqishini hisoblang.

https://tartib.uk/tools/fee-breakeven

Tartib — инструмент учёта и дисциплины. Не инвестиционная рекомендация.
Tartib — hisob va intizom vositasi. Investitsiya tavsiyasi emas.$post$),
  (11, $post$Дневник дня

Короткая запись вечером: что получилось, где нарушил правила, что сделаю завтра иначе. Две минуты в день дают больше, чем новый индикатор.

Kun kundaligi

Kechqurun qisqa yozuv: nima chiqdi, qayerda qoidani buzdim, ertaga nimani boshqacha qilaman. Kuniga ikki daqiqa yangi indikatordan ko'proq beradi.

https://tartib.uk/blog/trading-diary

Tartib — инструмент учёта и дисциплины. Не инвестиционная рекомендация.
Tartib — hisob va intizom vositasi. Investitsiya tavsiyasi emas.$post$),
  (12, $post$Акции США и правило PDT

Если на маржинальном счёте меньше 25 000 $ и вы делаете 4 и больше дей-трейдов за 5 торговых дней, брокер может ограничить счёт. Считайте свои дей-трейды заранее.

AQSh aksiyalari va PDT qoidasi

Marja hisobida 25 000 $ dan kam bo'lsa va 5 savdo kuni ichida 4 va undan ko'p day-trade qilsangiz, broker hisobni cheklashi mumkin. Day-tradelaringizni oldindan sanang.

https://tartib.uk/blog/nasdaq-sessions-pdt-risk

Tartib — инструмент учёта и дисциплины. Не инвестиционная рекомендация.
Tartib — hisob va intizom vositasi. Investitsiya tavsiyasi emas.$post$),
  (13, $post$Риск разорения

Даже при положительном ожидании слишком крупная ставка на сделку может привести к потере счёта из-за серии убытков. Маленький риск на сделку — не слабость, а математика выживания.

Tugash xavfi

Ijobiy kutilgan natijada ham bitimga juda katta stavka zararlar seriyasi tufayli hisobni yo'qotishga olib kelishi mumkin. Bitimga kichik risk — zaiflik emas, omon qolish matematikasi.

https://tartib.uk/blog/risk-of-ruin

Tartib — инструмент учёта и дисциплины. Не инвестиционная рекомендация.
Tartib — hisob va intizom vositasi. Investitsiya tavsiyasi emas.$post$),
  (14, $post$Золото и металлы в одном месте

Цены золота, серебра, платины, палладия и меди, пересчёт в граммы и килограммы, индекс доллара и доходность облигаций США — на одной странице Tartib после регистрации.

Oltin va metallar bir joyda

Oltin, kumush, platina, palladiy va mis narxlari, gramm va kilogrammga hisoblash, dollar indeksi va AQSh obligatsiyalari daromadliligi — ro'yxatdan o'tgach Tartibning bitta sahifasida.

https://tartib.uk/register

Tartib — инструмент учёта и дисциплины. Не инвестиционная рекомендация.
Tartib — hisob va intizom vositasi. Investitsiya tavsiyasi emas.$post$);

-- Отправляет следующий неотправленный пост в канал; вызывается раз в день по расписанию
create or replace function public.send_channel_post() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  token text;
  chan text;
  post public.channel_posts;
  req bigint;
begin
  select value into token from public.bot_config where key = 'telegram_token';
  select value into chan from public.bot_config where key = 'channel_id';
  if token is null or chan is null then return 'skip: no channel_id'; end if;
  select * into post from public.channel_posts where sent_at is null order by id limit 1;
  if post.id is null then return 'skip: queue empty'; end if;
  select net.http_post(
    url := 'https://api.telegram.org/bot' || token || '/sendMessage',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('chat_id', chan, 'text', post.body)
  ) into req;
  update public.channel_posts set sent_at = now(), request_id = req where id = post.id;
  return 'sent ' || post.id;
end $$;
revoke all on function public.send_channel_post() from public, anon, authenticated;

-- Раз в день в 09:00 по Ташкенту (04:00 UTC)
select cron.schedule('channel-post', '0 4 * * *', $job$ select public.send_channel_post(); $job$);
