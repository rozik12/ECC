import test from "node:test";
import assert from "node:assert/strict";
import { cleanSymbol, convertMetaTrader, decodeText, lotsToUnits, MT_HEADER, parseHtmlTables } from "../lib/import-presets.ts";
import { autoMapColumns, inferMarket, normalizeDirection, parseDateTime, parseLooseNumber } from "../lib/import-map.ts";

const cell = (t: string, tag = "td") => `<${tag} nowrap>${t}</${tag}>`;
const tr = (cells: string[]) => `<tr align="right">${cells.map((c) => cell(c)).join("")}</tr>`;

const MT4_HEAD = ["Ticket", "Open Time", "Type", "Size", "Item", "Price", "S / L", "T / P", "Close Time", "Price", "Commission", "Taxes", "Swap", "Profit"];
const MT4_HTML = `<html><head><title>Statement: 123456 - Test</title><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><style>td{x:y}</style></head><body>
<table cellspacing="1" cellpadding="3" border="0">
<tr align="left"><td colspan="14"><b>Closed Transactions:</b></td></tr>
<tr align="center" bgcolor="#C0C0C0">${MT4_HEAD.map((h) => cell(`<b>${h}</b>`)).join("")}</tr>
${tr(["1001", "2026.10.01 10:00:00", "buy", "0.10", "eurusd", "1.10000", "1.09500", "1.11000", "2026.10.01 12:30:00", "1.10500", "-0.70", "0.00", "-0.12", "50.00"])}
${tr(["1002", "2026.10.01 13:00:00", "sell", "1.00", "xauusd.m", "2000.00", "0.00", "0.00", "2026.10.01 15:00:00", "2010.00", "-7.00", "0.00", "0.00", "-1&nbsp;000.00"])}
<tr align="right"><td>1000</td><td>2026.09.30 09:00:00</td><td>balance</td><td colspan="10">Deposit</td><td>1&nbsp;000.00</td></tr>
${tr(["1003", "2026.10.02 10:00:00", "buy limit", "0.10", "gbpusd", "1.30000", "0.00", "0.00", "", "", "0.00", "0.00", "0.00", "0.00"])}
<tr align="right"><td colspan="10">&nbsp;</td><td><b>Closed P/L:</b></td><td colspan="3"><b>-957.82</b></td></tr>
<tr align="left"><td colspan="14"><b>Open Trades:</b></td></tr>
<tr align="center">${MT4_HEAD.map((h, i) => cell(`<b>${i === 8 ? "" : h}</b>`)).join("")}</tr>
${tr(["1004", "2026.10.03 10:00:00", "buy", "0.10", "usdjpy", "150.000", "0.000", "0.000", "", "150.500", "0.00", "0.00", "0.00", "33.00"])}
</table></body></html>`;

test("импорт MT4: чтение HTML-таблиц, сущности, скрипты и стили отбрасываются", () => {
  const rows = parseHtmlTables(MT4_HTML);
  assert.deepEqual(rows[1].slice(0, 3), ["Ticket", "Open Time", "Type"]);
  assert.equal(rows.flat().some((c) => /x:y|<|&nbsp;/.test(c)), false);
  assert.ok(rows.some((r) => r.includes("-1 000.00")));
});

test("импорт MT4: закрытые сделки пересчитаны, лишнее пропущено", () => {
  const r = convertMetaTrader(parseHtmlTables(MT4_HTML))!;
  assert.equal(r.platform, "mt4");
  assert.deepEqual(r.header, MT_HEADER);
  assert.equal(r.used, 2);
  const [a, b] = r.rows;
  // EURUSD: 0,10 лота = 10 000 единиц; итог = 50 − 0,70 − 0,12
  assert.deepEqual(a, ["2026.10.01 10:00:00", "EURUSD", "buy", "1.1", "1.105", "1.095", "1.11", "10000", "0.7", "49.18", "MT4 #1001"]);
  // золото с суффиксом брокера: 1 лот = 100 унций, пустые стоп и цель, число с пробелом тысяч
  assert.deepEqual(b, ["2026.10.01 13:00:00", "XAUUSD", "sell", "2000", "2010", "", "", "100", "7", "-1007", "MT4 #1002"]);
  assert.equal(r.skipped, 3); // пополнение, отложенный ордер и ещё не закрытая позиция; итоговая строка и заголовки не считаются
});

test("импорт MT4: результат читается нашим импортёром без ручной настройки столбцов", () => {
  const r = convertMetaTrader(parseHtmlTables(MT4_HTML))!;
  const m = autoMapColumns(r.header);
  for (const f of ["date_time", "instrument", "direction", "entry", "exit", "stop_loss", "take_profit", "size", "fees", "pnl", "comment"] as const) assert.notEqual(m[f], null, f);
  const row = r.rows[0];
  assert.equal(normalizeDirection(row[m.direction as number]), "long");
  assert.equal(normalizeDirection(r.rows[1][m.direction as number]), "short");
  assert.equal(parseLooseNumber(row[m.pnl as number]), 49.18);
  const d = parseDateTime(row[m.date_time as number])!;
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()], [2026, 9, 1, 10, 0]);
  assert.equal(inferMarket(row[m.instrument as number]), "forex");
  assert.equal(inferMarket("XAUUSD"), "forex");
  assert.equal(inferMarket("BTCUSDT"), "crypto");
});

test("импорт MT5: отчёт в UTF-16 и таблица позиций с повторяющимися названиями столбцов", () => {
  const head = ["Time", "Position", "Symbol", "Type", "Volume", "Price", "S / L", "T / P", "Time", "Price", "Commission", "Swap", "Profit"];
  const html = `<html><body><table><tr><td colspan="13"><b>Positions</b></td></tr><tr>${head.map((h) => cell(h, "th")).join("")}</tr>
${tr(["2026.10.02 08:15:00", "5001", "EURUSD", "sell", "0.50", "1.12000", "1.12500", "1.11000", "2026.10.02 11:00:00", "1.11500", "-3.50", "-1.20", "250.00"])}
${tr(["2026.10.02 12:00:00", "5002", "BTCUSD", "buy", "0.01", "60 000.00", "", "", "2026.10.02 13:00:00", "60 500.00", "-0.50", "0.00", "5.00"])}
<tr><td>Total</td><td colspan="12">&nbsp;</td></tr></table></body></html>`;
  const utf16 = new Uint8Array(Buffer.from("﻿" + html, "utf16le"));
  const text = decodeText(utf16);
  assert.ok(text.includes("Positions"));
  const r = convertMetaTrader(parseHtmlTables(text))!;
  assert.equal(r.platform, "mt5");
  assert.equal(r.used, 2);
  assert.deepEqual(r.rows[0], ["2026.10.02 08:15:00", "EURUSD", "sell", "1.12", "1.115", "1.125", "1.11", "50000", "3.5", "245.3", "MT5 #5001"]);
  assert.deepEqual(r.rows[1].slice(1, 4), ["BTCUSD", "buy", "60000"]);
  assert.equal(r.rows[1][7], "0.01"); // для не-валютных инструментов размер остаётся как в отчёте
  // то же без метки порядка байт
  const noBom = new Uint8Array(Buffer.from(html, "utf16le"));
  assert.ok(decodeText(noBom).includes("Positions"));
  assert.ok(decodeText(new Uint8Array(Buffer.from(html, "utf8"))).includes("Positions"));
});

test("импорт MT: то же работает для CSV-таблицы, другие файлы не опознаются", () => {
  const csv = [MT4_HEAD, ["1001", "2026.10.01 10:00:00", "buy", "0.10", "eurusd", "1.1", "", "", "2026.10.01 12:30:00", "1.105", "-0.7", "0", "0", "50"]];
  assert.equal(convertMetaTrader(csv)?.used, 1);
  assert.equal(convertMetaTrader([["date", "symbol", "side", "price"], ["2026-10-01", "BTCUSDT", "buy", "1"]]), null);
  assert.equal(convertMetaTrader([]), null);
  assert.equal(convertMetaTrader(parseHtmlTables("<html><body><p>нет таблиц</p></body></html>")), null);
});

test("импорт MT: названия инструментов и лоты", () => {
  assert.equal(cleanSymbol("eurusd"), "EURUSD");
  assert.equal(cleanSymbol("EURUSD.m"), "EURUSD");
  assert.equal(cleanSymbol("EURUSDpro"), "EURUSD");
  assert.equal(cleanSymbol("XAUUSD#"), "XAUUSD");
  assert.equal(cleanSymbol("#AAPL"), "AAPL");
  assert.equal(cleanSymbol("US30"), "US30");
  assert.equal(cleanSymbol("BTCUSD"), "BTCUSD"); // не валютная пара: не обрезается
  assert.equal(lotsToUnits("EURUSD", 0.01), 1000);
  assert.equal(lotsToUnits("XAUUSD", 2), 200);
  assert.equal(lotsToUnits("XAGUSD", 1), 5000);
  assert.equal(lotsToUnits("US30", 3), 3);
});

test("импорт: безопасность. Теги и скрипты из файла не попадают в данные", () => {
  const evil = `<table><tr>${MT4_HEAD.map((h) => cell(h)).join("")}</tr>${tr(["<script>alert(1)</script>7", "2026.10.01 10:00:00", "buy", "0.1", "<img src=x onerror=alert(1)>EURUSD", "1.1", "", "", "2026.10.01 12:00:00", "1.2", "0", "0", "0", "5"])}</table>`;
  const r = convertMetaTrader(parseHtmlTables(evil))!;
  assert.equal(r.rows.flat().some((c) => /[<>]/.test(c)), false);
});
