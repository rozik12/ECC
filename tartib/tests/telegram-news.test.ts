import test from "node:test";
import assert from "node:assert/strict";
import { mergeHeadlines, parseHeadlines, safeLink } from "../supabase/functions/telegram-bot/news.ts";
import { mainMenu, newsScreen } from "../supabase/functions/telegram-bot/ui.ts";

const NOW = Date.parse("2026-10-09T12:00:00Z");
const item = (t: string, l: string, d = "Fri, 09 Oct 2026 10:00:00 GMT") => `<item><title>${t}</title><link>${l}</link><pubDate>${d}</pubDate></item>`;

test("бот-новости: разбор заголовков, CDATA, сущности, метки в ссылке", () => {
  const xml = `<rss>${item("<![CDATA[Bitcoin &amp; ETH]]>", "https://e.com/a?utm_source=x&id=1")}${item("Без даты", "https://e.com/b", "ошибка")}${item("Плохая ссылка", "javascript:alert(1)")}</rss>`;
  const r = parseHeadlines(xml, "E", NOW);
  assert.equal(r.length, 1);
  assert.equal(r[0].title, "Bitcoin & ETH");
  assert.equal(r[0].link, "https://e.com/a?id=1");
  assert.equal(safeLink("ftp://e.com"), null);
});

test("бот-новости: объединение без повторов, свежие сверху, лимит", () => {
  const a = parseHeadlines(`${item("A", "https://e.com/1", "Fri, 09 Oct 2026 09:00:00 GMT")}${item("B", "https://e.com/2", "Fri, 09 Oct 2026 11:00:00 GMT")}`, "S1", NOW);
  const b = parseHeadlines(item("A дубль", "http://e.com/1/", "Fri, 09 Oct 2026 09:30:00 GMT") + item("C", "https://e.com/3", "Fri, 09 Oct 2026 10:00:00 GMT"), "S2", NOW);
  assert.deepEqual(mergeHeadlines([a, b], 10).map((h) => h.link.replace(/^https?:\/\//, "")), ["e.com/2", "e.com/3", "e.com/1/"]);
  assert.equal(mergeHeadlines([a, b], 2).length, 2);
});

test("бот-новости: экран экранирует разметку и ссылки, пустой список даёт сообщение", () => {
  const s = newsScreen("ru", [{ title: "A <b>&</b>", link: 'https://e.com/x?a="1"&b=2', at: NOW, source: "S<1>" }]);
  assert.match(s.text, /A &lt;b&gt;&amp;&lt;\/b&gt;/);
  assert.match(s.text, /href="https:\/\/e\.com\/x\?a=&quot;1&quot;&amp;b=2"/);
  assert.match(s.text, /S&lt;1&gt;/);
  assert.match(newsScreen("en", []).text, /unavailable/);
});

test("в главном меню есть кнопка новостей на всех языках", () => {
  for (const l of ["ru", "en", "uz"] as const) {
    const all = mainMenu(l).kb!.inline_keyboard.flat();
    assert.ok(all.some((b) => b.callback_data === "m:news"), l);
    assert.ok(all.every((b) => !b.callback_data || new TextEncoder().encode(b.callback_data).length <= 64));
  }
});
