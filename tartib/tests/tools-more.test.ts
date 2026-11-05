import test from "node:test";
import assert from "node:assert/strict";
import { feeBreakeven, goalPlan, kelly, liquidation, margin, riskOfRuin, tradeProfit } from "../lib/tools.ts";
import { CALC_SLUGS, dictPath, TOOL_DEFS } from "../lib/tool-defs.ts";
import { readFileSync } from "node:fs";

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("Келли: известные значения и отрицательное ожидание", () => {
  const r = kelly({ winRate: 60, rr: 1 });
  assert.ok(r.ok);
  if (r.ok) { near(r.kellyPct, 20); near(r.halfPct, 10); near(r.quarterPct, 5); near(r.edge, 0.2); }
  const bad = kelly({ winRate: 30, rr: 1 });
  assert.ok(bad.ok && bad.kellyPct === 0 && bad.edge < 0);
  for (const x of [{ winRate: 0, rr: 1 }, { winRate: 100, rr: 1 }, { winRate: 50, rr: 0 }, { winRate: NaN, rr: 1 }]) assert.equal(kelly(x).ok, false);
});

test("риск разорения: монетка 1:1, нулевое ожидание, совпадение с симуляцией", () => {
  // p=0.6, rr=1: вероятность дойти до −U равна (q/p)^U. Запас U=10 сделок.
  const r = riskOfRuin({ winRate: 60, rr: 1, riskPct: 5, ruinDrawdown: 40.126306 });
  assert.ok(r.ok);
  if (r.ok) { near(r.cushionR, Math.log(1 - 0.40126306) / Math.log(0.95), 1e-6); near(r.ruinPct, Math.pow(2 / 3, r.cushionR) * 100, 1e-6); }
  const zero = riskOfRuin({ winRate: 40, rr: 1.5, riskPct: 1, ruinDrawdown: 50 });
  assert.ok(zero.ok && zero.ruinPct === 100 && Math.abs(zero.expectancyR) < 1e-12);
  const neg = riskOfRuin({ winRate: 30, rr: 1, riskPct: 1, ruinDrawdown: 50 });
  assert.ok(neg.ok && neg.ruinPct === 100);

  // Симуляция (детерминированный генератор): p=0.45, rr=2, запас 8 единиц риска
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  let ruined = 0;
  const N = 4000;
  for (let k = 0; k < N; k++) {
    let s = 0;
    for (let i = 0; i < 2000; i++) { s += rnd() < 0.45 ? 2 : -1; if (s <= -8) { ruined++; break; } if (s > 80) break; }
  }
  const cushionPct = (1 - Math.pow(0.99, 8)) * 100; // 8 единиц риска при риске 1% на сделку
  const m = riskOfRuin({ winRate: 45, rr: 2, riskPct: 1, ruinDrawdown: cushionPct });
  assert.ok(m.ok);
  if (m.ok) assert.ok(Math.abs(m.ruinPct - (ruined / N) * 100) < 3, `${m.ruinPct} vs ${(ruined / N) * 100}`);
});

test("ликвидация: лонг и шорт с плечом 10", () => {
  const l = liquidation({ entry: 100, size: 2, leverage: 10, maintenancePct: 0.5, direction: "long" });
  assert.ok(l.ok);
  if (l.ok) { near(l.price, 100 * (1 - 0.095)); near(l.distancePct, 9.5); near(l.margin, 20); }
  const s = liquidation({ entry: 100, size: 1, leverage: 10, maintenancePct: 0.5, direction: "short" });
  assert.ok(s.ok && Math.abs(s.price - 109.5) < 1e-9);
  assert.equal(liquidation({ entry: 100, size: 1, leverage: 200, maintenancePct: 0.6, direction: "long" }).ok, false); // 1/200 < 0.6%
  assert.equal(liquidation({ entry: 100, size: 1, leverage: 0.5, maintenancePct: 0.5, direction: "long" }).ok, false);
});

test("безубыток с комиссией и результат сделки", () => {
  const b = feeBreakeven({ entry: 100, feePct: 0.1, direction: "long" });
  assert.ok(b.ok);
  if (b.ok) { near(b.price, (100 * 1.001) / 0.999); assert.ok(b.price > 100.2 && b.price < 100.21); near(b.feeTotalPct, 0.2); }
  const sh = feeBreakeven({ entry: 100, feePct: 0.1, direction: "short" });
  assert.ok(sh.ok && sh.price < 100);
  // на цене безубытка результат сделки равен нулю
  if (b.ok) { const p = tradeProfit({ entry: 100, exit: b.price, size: 3, direction: "long", feePct: 0.1 }); assert.ok(p.ok && Math.abs(p.net) < 1e-9); }
  const t = tradeProfit({ entry: 100, exit: 105, size: 10, direction: "long", feePct: 0.05, balance: 5000 });
  assert.ok(t.ok);
  if (t.ok) { near(t.gross, 50); near(t.fees, 1.025); near(t.net, 48.975); near(t.pctOfBalance!, 0.9795); }
  const short = tradeProfit({ entry: 100, exit: 95, size: 10, direction: "short", feePct: 0, balance: null });
  assert.ok(short.ok && short.gross === 50 && short.pctOfBalance === null);
});

test("план цели и маржа", () => {
  const g = goalPlan({ start: 1000, target: 2000, monthlyPct: 10, monthlyDeposit: 0 });
  assert.ok(g.ok && g.months === 8); // 1.1^7=1.95, 1.1^8=2.14
  assert.equal(goalPlan({ start: 1000, target: 900, monthlyPct: 5, monthlyDeposit: 0 }).ok, false);
  assert.equal(goalPlan({ start: 1000, target: 2000, monthlyPct: 0, monthlyDeposit: 0 }).ok, false);
  const d = goalPlan({ start: 0, target: 1000, monthlyPct: 0, monthlyDeposit: 100 });
  assert.ok(d.ok && d.months === 10 && d.deposited === 1000);
  const m = margin({ positionValue: 10000, leverage: 10, balance: 5000 });
  assert.ok(m.ok && m.margin === 1000 && m.marginPctOfBalance === 20 && m.maxPosition === 50000);
  assert.equal(margin({ positionValue: 10000, leverage: 0.5 }).ok, false);
});

test("каждый калькулятор считает значения по умолчанию, ключи есть в трёх словарях", () => {
  const dicts = ["ru", "uz", "en"].map((l) => JSON.parse(readFileSync(`lib/i18n/dictionaries/${l}.json`, "utf8")));
  for (const slug of CALC_SLUGS) {
    const def = TOOL_DEFS[slug];
    const values = Object.fromEntries(def.fields.map((f) => [f.id, Number(f.def)]));
    const rows = def.compute(values);
    assert.ok(rows && rows.length > 0, `${slug}: нет результата для значений по умолчанию`);
    for (const d of dicts) {
      const k = dictPath(slug).split(".").reduce((a: Record<string, unknown>, part) => a[part] as Record<string, unknown>, d) as unknown as { title: string; desc: string; note?: string; f: Record<string, string>; o: Record<string, string>; c?: Record<string, string> };
      assert.ok(k?.title && k?.desc, `${slug}: нет названия`);
      for (const f of def.fields) assert.ok(k.f[f.id], `${slug}.f.${f.id}`);
      for (const r of rows) assert.ok(k.o[r.key], `${slug}.o.${r.key}`);
    }
  }
});

import { futuresRisk, stockSize } from "../lib/tools.ts";

test("stockSize: целые акции, риск не превышен", () => {
  const r = stockSize({ balance: 10000, riskPct: 1, entry: 180, stop: 176, feePerShare: 0 });
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.shares, 25); assert.equal(r.direction, "long"); assert.ok(r.riskAmount <= r.plannedRisk); }
  const s = stockSize({ balance: 10000, riskPct: 1, entry: 176, stop: 180, feePerShare: 0.005 });
  assert.ok(s.ok && s.direction === "short" && s.riskAmount <= s.plannedRisk);
  assert.equal(stockSize({ balance: 10000, riskPct: 1, entry: 100, stop: 100, feePerShare: 0 }).ok, false);
});

test("futuresRisk: MNQ и NQ, размер для формы", () => {
  const m = futuresRisk({ balance: 25000, riskPct: 1, entry: 20000, stop: 19980, contract: 2, feePerContract: 0 });
  assert.ok(m.ok);
  if (m.ok) { assert.equal(m.contracts, 6); assert.equal(m.formSize, 12); assert.equal(m.riskAmount, 240); }
  const n = futuresRisk({ balance: 25000, riskPct: 1, entry: 20000, stop: 19980, contract: 1, feePerContract: 0 });
  assert.ok(n.ok && n.contracts === 0);
  assert.equal(futuresRisk({ balance: 25000, riskPct: 1, entry: 1, stop: 2, contract: 99, feePerContract: 0 }).ok, false);
});

test("золото: GC, MGC и лот XAUUSD", () => {
  // стоп 10 долларов: GC = $1000 на контракт, MGC = $100, лот XAUUSD = $1000
  const gc = futuresRisk({ balance: 50000, riskPct: 1, entry: 4200, stop: 4190, contract: 5, feePerContract: 0 });
  assert.ok(gc.ok && gc.contracts === 0 && gc.riskPerContract === 1000 && gc.pointValue === 100);
  const mgc = futuresRisk({ balance: 50000, riskPct: 1, entry: 4200, stop: 4190, contract: 6, feePerContract: 0 });
  assert.ok(mgc.ok && mgc.contracts === 5 && mgc.riskAmount === 500 && mgc.formSize === 50);
  const lot = futuresRisk({ balance: 50000, riskPct: 2, entry: 4200, stop: 4190, contract: 14, feePerContract: 0 });
  assert.ok(lot.ok && lot.contracts === 1 && lot.formSize === 100 && lot.direction === "long");
  const oil = futuresRisk({ balance: 100000, riskPct: 1, entry: 90, stop: 91, contract: 8, feePerContract: 0 });
  assert.ok(oil.ok && oil.contracts === 1 && oil.direction === "short");
});

import { optionPayoff } from "../lib/tools.ts";

test("опционы: купленный колл", () => {
  const r = optionPayoff({ kind: 1, side: 1, strike: 200, premium: 5, contracts: 2, multiplier: 100, underlying: 220 });
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.breakeven, 205); assert.equal(r.premiumTotal, 1000); assert.equal(r.maxLoss, 1000); assert.equal(r.maxProfit, null); assert.equal(r.pnlAtExpiry, 3000); near(r.moveToBreakevenPct as number, ((205 - 220) / 220) * 100); }
  const out = optionPayoff({ kind: 1, side: 1, strike: 200, premium: 5, contracts: 1, multiplier: 100, underlying: 190 });
  assert.ok(out.ok && out.pnlAtExpiry === -500); // истёк без выплаты: потеряна премия
});

test("опционы: пут, проданные опционы и ошибки", () => {
  const lp = optionPayoff({ kind: 2, side: 1, strike: 100, premium: 4, contracts: 1, multiplier: 100, underlying: 80 });
  assert.ok(lp.ok && lp.breakeven === 96 && lp.maxProfit === 9600 && lp.maxLoss === 400 && lp.pnlAtExpiry === 1600);
  const sc = optionPayoff({ kind: 1, side: 2, strike: 100, premium: 3, contracts: 1, multiplier: 100, underlying: 130 });
  assert.ok(sc.ok && sc.maxLoss === null && sc.maxProfit === 300 && sc.pnlAtExpiry === -2700 && sc.breakeven === 103);
  const sp = optionPayoff({ kind: 2, side: 2, strike: 100, premium: 3, contracts: 2, multiplier: 100, underlying: null });
  assert.ok(sp.ok && sp.maxProfit === 600 && sp.maxLoss === 19400 && sp.pnlAtExpiry === null);
  assert.equal(optionPayoff({ kind: 3, side: 1, strike: 100, premium: 3, contracts: 1, multiplier: 100, underlying: null }).ok, false);
  assert.equal(optionPayoff({ kind: 1, side: 1, strike: 0, premium: 3, contracts: 1, multiplier: 100, underlying: null }).ok, false);
});

import { forexLot } from "../lib/tools.ts";

test("форекс: лот и стоимость пункта по классам пар", () => {
  const base = { balance: 5000, riskPct: 1, stopPips: 25, quoteToUsd: null, spreadPips: 1, leverage: 30 };
  // EUR/USD: пункт 10 $, риск 50 $ / (25 × 10) = 0,2 лота
  const eur = forexLot({ ...base, pairClass: 1, price: 1.12 });
  assert.ok(eur.ok && eur.pipValue === 10 && eur.lots === 0.2 && eur.units === 20000 && Math.abs(eur.actualRisk - 50) < 1e-9 && Math.abs(eur.spreadCost - 2) < 1e-9);
  if (eur.ok) near(eur.margin as number, (20000 * 1.12) / 30);
  // USD/CHF по 0,9: пункт 10 / 0,9 = 11,11 $
  const chf = forexLot({ ...base, pairClass: 2, price: 0.9 });
  assert.ok(chf.ok && Math.abs(chf.pipValue - 11.1111111) < 1e-6 && chf.lots === 0.18);
  if (chf.ok) near(chf.margin as number, 18000 / 30);
  // USD/JPY по 150: пункт 1000 / 150 = 6,67 $
  const jpy = forexLot({ ...base, pairClass: 3, price: 150 });
  assert.ok(jpy.ok && Math.abs(jpy.pipValue - 6.6666667) < 1e-6 && jpy.lots === 0.3);
  // EUR/GBP по 0,85, фунт = 1,25 $: пункт 12,5 $
  const cross = forexLot({ ...base, pairClass: 4, price: 0.85, quoteToUsd: 1.25 });
  assert.ok(cross.ok && cross.pipValue === 12.5 && cross.lots === 0.16);
  if (cross.ok) near(cross.margin as number, (16000 * 0.85 * 1.25) / 30);
});

test("форекс: округление вниз, без плеча и ошибки", () => {
  const r = forexLot({ balance: 1000, riskPct: 1, stopPips: 33, pairClass: 1, price: 1.1, quoteToUsd: null, spreadPips: 0, leverage: null });
  assert.ok(r.ok && r.lots === 0.03 && r.actualRisk <= r.riskAmount && r.margin === null); // 10 / (33×10) = 0,0303 → 0,03
  assert.equal(forexLot({ balance: 1000, riskPct: 1, stopPips: 33, pairClass: 4, price: 1.1, quoteToUsd: null, spreadPips: 0, leverage: null }).ok, false); // кросс без курса
  assert.equal(forexLot({ balance: 1000, riskPct: 1, stopPips: 0, pairClass: 1, price: 1.1, quoteToUsd: null, spreadPips: 0, leverage: 30 }).ok, false);
  assert.equal(forexLot({ balance: 1000, riskPct: 1, stopPips: 10, pairClass: 9, price: 1.1, quoteToUsd: null, spreadPips: 0, leverage: 30 }).ok, false);
});

import { averagePrice } from "../lib/tools.ts";

test("усреднение: новая средняя цена", () => {
  const r = averagePrice({ amount: 10, avgPrice: 100, buyAmount: 10, buyPrice: 80 });
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.newAvg, 90); assert.equal(r.newAmount, 20); assert.equal(r.totalCost, 1800); near(r.avgChangePct, -10); near(r.riseToBreakevenPct, 12.5); }
  const first = averagePrice({ amount: 0, avgPrice: 0, buyAmount: 5, buyPrice: 20 });
  assert.ok(first.ok && first.newAvg === 20 && first.avgChangePct === 0);
  assert.equal(averagePrice({ amount: 1, avgPrice: 1, buyAmount: 0, buyPrice: 1 }).ok, false);
  assert.equal(averagePrice({ amount: -1, avgPrice: 1, buyAmount: 1, buyPrice: 1 }).ok, false);
});
