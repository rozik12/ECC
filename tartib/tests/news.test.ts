import test from "node:test";
import assert from "node:assert/strict";
import { cleanImage, cleanLink, decodeEntities, filterNews, imageOf, isTradingRelated, mergeNews, parseDate, parseFeed, type NewsItem } from "../lib/news.ts";

const NOW = Date.parse("2026-10-09T12:00:00Z");

test("RSS: заголовок в CDATA, сущности и метки отслеживания", () => {
  const xml = `<rss><channel><item><title><![CDATA[Bitcoin &amp; ETH: &#x201c;рост&#x201d;]]></title><link><![CDATA[https://example.com/a?utm_source=rss&id=5]]></link><pubDate>Fri, 09 Oct 2026 10:49:24 +0000</pubDate></item></channel></rss>`;
  const [it] = parseFeed(xml, NOW);
  assert.equal(it.title, "Bitcoin & ETH: “рост”");
  assert.equal(it.link, "https://example.com/a?id=5");
  assert.equal(it.at, Date.parse("2026-10-09T10:49:24Z"));
});

test("RSS: теги внутри заголовка вырезаются, пробелы сжимаются", () => {
  const [it] = parseFeed(`<item><title>  Курс  <b>растёт</b>\n сегодня </title><link>https://e.com/1</link><pubDate>Fri, 09 Oct 2026 10:00:00 GMT</pubDate></item>`, NOW);
  assert.equal(it.title, "Курс растёт сегодня");
});

test("Atom: ссылка берётся из href", () => {
  const [it] = parseFeed(`<feed><entry><title>Atom</title><link href="https://e.com/atom"/><updated>2026-10-09T09:00:00Z</updated></entry></feed>`, NOW);
  assert.equal(it.link, "https://e.com/atom");
});

test("дата без часового пояса считается UTC, будущее обрезается до «сейчас»", () => {
  assert.equal(parseDate("2026-10-09 12:58:31", NOW), NOW);
  assert.equal(parseDate("2026-10-09 10:00:00", NOW), Date.parse("2026-10-09T10:00:00Z"));
  assert.equal(parseDate("не дата", NOW), null);
});

test("опасные ссылки отбрасываются", () => {
  assert.equal(cleanLink("javascript:alert(1)"), null);
  assert.equal(cleanLink("data:text/html,<script>"), null);
  assert.equal(cleanLink("ftp://e.com/x"), null);
  assert.equal(cleanLink("not a url"), null);
  assert.equal(cleanLink("https://e.com/x?mod=mw_rss&ref=1&ok=1"), "https://e.com/x?ok=1");
  assert.equal(parseFeed(`<item><title>X</title><link>javascript:alert(1)</link><pubDate>Fri, 09 Oct 2026 10:00:00 GMT</pubDate></item>`, NOW).length, 0);
});

test("записи без заголовка, ссылки или даты пропускаются", () => {
  assert.equal(parseFeed(`<item><link>https://e.com</link></item><item><title>Нет даты</title><link>https://e.com/2</link></item>`, NOW).length, 0);
});

test("сущности: числовые, именованные и неизвестные", () => {
  assert.equal(decodeEntities("a&nbsp;b &#8217; &#x41; &unknown; &amp;"), "a b ’ A &unknown; &");
});

const mk = (i: number, over: Partial<NewsItem> = {}): NewsItem => ({ title: "T" + i, link: `https://e.com/${i}`, at: NOW - i * 1000, source: "S", sourceUrl: "https://e.com", lang: "en", category: "crypto", ...over });

test("объединение: дубли по ссылке убираются, свежее выше, есть лимит", () => {
  const merged = mergeNews([mk(3), mk(1), mk(2), mk(1, { source: "Другой", link: "http://e.com/1/" })], 2);
  assert.deepEqual(merged.map((i) => i.title), ["T1", "T2"]);
});

test("фильтры по категории и языку", () => {
  const items = [mk(1), mk(2, { lang: "ru", category: "markets" }), mk(3, { lang: "uz", category: "uzbekistan" })];
  assert.equal(filterNews(items, "all", "all").length, 3);
  assert.deepEqual(filterNews(items, "markets", "all").map((i) => i.title), ["T2"]);
  assert.deepEqual(filterNews(items, "all", "uz").map((i) => i.title), ["T3"]);
  assert.equal(filterNews(items, "crypto", "ru").length, 0);
});

const rssItem = (inner: string) => `<item><title>T</title><link>https://e.com/x</link><pubDate>Fri, 09 Oct 2026 10:00:00 GMT</pubDate>${inner}</item>`;

test("картинка: media:content, enclosure, thumbnail и <img> в тексте", () => {
  assert.equal(parseFeed(rssItem(`<media:content url="https://i.e.com/a.jpg" medium="image"/>`), NOW)[0].image, "https://i.e.com/a.jpg");
  assert.equal(parseFeed(rssItem(`<enclosure url="https://i.e.com/b.png" length="1" type="image/png"/>`), NOW)[0].image, "https://i.e.com/b.png");
  assert.equal(parseFeed(rssItem(`<media:thumbnail url="https://i.e.com/c"/>`), NOW)[0].image, "https://i.e.com/c");
  assert.equal(parseFeed(rssItem(`<description><![CDATA[<p><img src="https://i.e.com/d.webp" width="10"></p>]]></description>`), NOW)[0].image, "https://i.e.com/d.webp");
  assert.equal(parseFeed(rssItem(`<description>&lt;img src=&quot;https://i.e.com/e.jpg&quot;&gt;</description>`), NOW)[0].image, "https://i.e.com/e.jpg");
});

test("картинка: видео и аудио не берутся, http поднимается до https, мусор отбрасывается", () => {
  assert.equal(imageOf(`<enclosure url="https://e.com/v.mp4" type="video/mp4"/>`), null);
  assert.equal(imageOf(`<media:content url="https://e.com/a.mp3" type="audio/mpeg"/>`), null);
  assert.equal(cleanImage("http://i.e.com/a.jpg"), "https://i.e.com/a.jpg");
  assert.equal(cleanImage("javascript:alert(1)"), null);
  assert.equal(cleanImage("data:image/png;base64,AAAA"), null);
  assert.equal(cleanImage("https://e.com/pixel.gif"), null);
  assert.equal(cleanImage("https://e.com/logo.svg"), null);
  assert.equal(parseFeed(rssItem(""), NOW)[0].image, undefined);
});

test("слияние сохраняет картинку из дубля", () => {
  const merged = mergeNews([mk(1), mk(1, { link: "http://e.com/1/", image: "https://i.e.com/z.jpg", at: NOW - 5000 })]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].image, "https://i.e.com/z.jpg");
});

test("тема трейдинга: нужные заголовки проходят, посторонние нет", () => {
  for (const ok of ["Bitcoin climbs above $70,000", "Stocks fall as Fed signals higher rates", "Gold hits record high", "Курс доллара вырос на бирже", "Нефть дешевеет второй день", "Markaziy bank valyuta kursini belgiladi", "Oltin narxi oshdi", "BTC and ETH rally", "Рубль укрепился к юаню"])
    assert.equal(isTradingRelated(ok), true, ok);
  for (const no of ["В Ташкенте открылся новый парк", "Футболисты сборной вышли в финал", "Ob-havo ertaga o'zgaradi", "Celebrity chef opens new restaurant", "Weather forecast for the weekend"])
    assert.equal(isTradingRelated(no), false, no);
});
