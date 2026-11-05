import test from "node:test";
import assert from "node:assert/strict";
import { formatMoney, parseNumber } from "../lib/format.ts";

// Виды пробелов (обычный, неразрывный, узкий) зависят от версии ICU, поэтому сравниваем с единым пробелом
const sp = (s: string) => s.replace(/[\s\u00a0\u202f]/g, " ");

test("деньги: одинаковый вид на сервере и в браузере для всех языков", () => {
  assert.equal(sp(formatMoney(5214.5, "USD", "ru")), "5 214,50 $");
  assert.equal(sp(formatMoney(5214.5, "USD", "uz")), "5 214,50 $");
  assert.equal(sp(formatMoney(5214.5, "USD", "en")), "$5,214.50");
  assert.equal(sp(formatMoney(-409, "USD", "en", true)), "-$409.00");
  assert.equal(sp(formatMoney(598, "USD", "ru", true)), "+598,00 $");
  assert.equal(sp(formatMoney(0, "USD", "ru", true)), "0,00 $");
  assert.equal(sp(formatMoney(12.3, "USDT", "en")), "USDT 12.30");
  assert.equal(sp(formatMoney(1000, "UZS", "en")), "soʻm 1,000.00");
  assert.equal(sp(formatMoney(1000, "eur", "ru")), "1 000,00 €");
});

test("разбор чисел: запятая, пробелы, мусор", () => {
  assert.equal(parseNumber("1 234,5"), 1234.5);
  assert.equal(parseNumber(" 0.25 "), 0.25);
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber("abc"), null);
});

import { dateFormat, formatCompact, formatDateTime, formatNumber } from "../lib/format.ts";

test("узбекский: числа и даты собираются сами и не зависят от данных браузера", () => {
  assert.equal(sp(formatNumber(1234567.891, "uz", 2)), "1 234 567,89");
  assert.equal(sp(formatNumber(-0.5, "uz", 4)), "-0,5");
  assert.equal(sp(formatMoney(5214, "USD", "uz")), "5 214,00 $");
  const d = new Date("2026-10-09T12:34:00Z");
  assert.equal(formatDateTime(d.toISOString(), "uz", "UTC"), "09.10.2026, 12:34");
  assert.equal(formatDateTime(d.toISOString(), "uz", "Asia/Tashkent"), "09.10.2026, 17:34");
  assert.equal(dateFormat("uz", { weekday: "short", timeZone: "UTC" }).format(d), "Juma");
  assert.equal(dateFormat("uz", { day: "numeric", month: "long", weekday: "short", timeZone: "UTC" }).format(d), "Juma, 9 Oktabr");
  assert.equal(dateFormat("uz", { month: "long", year: "numeric", timeZone: "UTC" }).format(d), "Oktabr 2026");
  assert.equal(dateFormat("uz", { month: "short", year: "2-digit", timeZone: "UTC" }).format(d), "Okt 26");
  assert.equal(dateFormat("uz", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(d), "09.10");
  assert.equal(dateFormat("uz", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(d), "12:34");
  assert.equal(dateFormat("uz", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(d), "09.10.2026, 12:34");
  // полночь не превращается в «24:00»
  assert.equal(dateFormat("uz", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date("2026-10-09T00:05:00Z")), "00:05");
  assert.match(formatCompact(1500, "uz"), /1\.5K|1,5K/);
});
