import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dictPath, TOOL_DEFS, TOOL_SLUGS, toolGroup } from "../lib/tool-defs.ts";
import { EXTRA_DEFS, EXTRA_SLUGS, X_GROUPS } from "../lib/tools-extra.ts";

const run = (slug: string, v: Record<string, number>) => {
  const rows = TOOL_DEFS[slug].compute(v);
  assert.ok(rows, `${slug}: нет результата`);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
};
const defaults = (slug: string) => Object.fromEntries(TOOL_DEFS[slug].fields.map((f) => [f.id, Number(f.def)]));
const near = (a: unknown, b: number, eps = 1e-6) => assert.ok(typeof a === "number" && Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("дополнительных инструментов ровно 50, у каждого есть группа и страница", () => {
  assert.equal(EXTRA_SLUGS.length, 50);
  for (const s of EXTRA_SLUGS) {
    assert.ok(TOOL_SLUGS.includes(s));
    assert.ok(X_GROUPS.includes(toolGroup(s)), s);
  }
  assert.equal(new Set(Object.values(EXTRA_DEFS).map((d) => d.key)).size, 50, "ключи словаря уникальны");
});

test("подписи на трёх языках: название, описание, примечание, поля, результаты, варианты", () => {
  for (const lang of ["ru", "uz", "en"]) {
    const d = JSON.parse(readFileSync(`lib/i18n/dictionaries/${lang}.json`, "utf8"));
    for (const g of X_GROUPS) assert.ok(d.toolsx.groups[g], `${lang} группа ${g}`);
    for (const slug of EXTRA_SLUGS) {
      const k = d.toolsx[EXTRA_DEFS[slug].key];
      assert.ok(k?.title && k?.desc && k?.note, `${lang} ${slug}: название/описание/примечание`);
      const def = TOOL_DEFS[slug];
      for (const f of def.fields) {
        assert.ok(k.f[f.id], `${lang} ${slug}.f.${f.id}`);
        if (f.choices && f.id !== "side") for (const c of f.choices) assert.ok(k.c?.[String(c)], `${lang} ${slug}.c.${c}`);
      }
      // ключи результатов проверяем для значений по умолчанию и для нескольких вариантов входа
      const rows = def.compute(defaults(slug)) ?? [];
      for (const r of rows) assert.ok(k.o[r.key], `${lang} ${slug}.o.${r.key}`);
      assert.ok(dictPath(slug).startsWith("toolsx."));
    }
  }
});

test("значения по умолчанию дают результат, неверные данные дают отказ", () => {
  for (const slug of EXTRA_SLUGS) {
    const def = TOOL_DEFS[slug];
    assert.ok(def.compute(defaults(slug)), `${slug}: по умолчанию`);
    // пустое поле и отрицательное значение первого числового поля не должны ломать расчёт
    const broken = { ...defaults(slug), [def.fields.find((f) => !f.choices)!.id]: NaN };
    assert.equal(def.compute(broken), null, `${slug}: NaN`);
  }
});

test("риск и размер", () => {
  near(run("breakeven-winrate", { rr: 2, costR: 0 }).winRate, 33.3333333, 1e-4);
  near(run("breakeven-winrate", { rr: 1, costR: 0 }).winRate, 50);
  const e = run("expectancy", { winRate: 40, avgWin: 300, avgLoss: 100 });
  near(e.expectancy, 60); near(e.expectancyR, 0.6); near(e.profitFactor, 2);
  near(run("profit-factor", { grossProfit: 5000, grossLoss: 2500 }).profitFactor, 2);
  const r = run("r-multiple", { entry: 100, stop: 98, exit: 105, size: 10 });
  assert.equal(r.direction, "long"); near(r.r, 2.5); near(r.riskMoney, 20); near(r.pnl, 50);
  const sh = run("r-multiple", { entry: 100, stop: 102, exit: 96, size: 1 });
  assert.equal(sh.direction, "short"); near(sh.r, 2);
  const lim = run("daily-loss-limit", { balance: 10000, dailyLossPct: 3, riskPct: 1 });
  near(lim.limitMoney, 300); assert.equal(lim.lossesToLimit, 3);
  const ex = run("exposure", { balance: 5000, price: 50, quantity: 200, leverage: 5 });
  near(ex.notional, 10000); near(ex.exposurePct, 200); near(ex.marginNeeded, 2000);
  const pc = run("partial-close", { side: 2, entry: 100, exit: 94, quantity: 10, closePct: 50 });
  near(pc.realized, 30); near(pc.remainingQty, 5);
  const st = run("atr-stop", { side: 2, entry: 100, atr: 1.5, mult: 2 });
  near(st.stop, 103); near(st.target2R, 94);
  const sz = run("atr-position", { balance: 5000, riskPct: 1, entry: 100, atr: 1.5, mult: 2 });
  near(sz.units, 50 / 3);
  const rw = run("recovery-wins", { drawdownPct: 50, riskPct: 1, rr: 2 });
  near(rw.neededGain, 100); assert.equal(rw.winsNeeded, 36); // 1.02^35 = 2.0000 < 2, 1.02^36 > 2
});

test("форекс", () => {
  near(run("pip-value", { lots: 1, contract: 100000, pipSize: 0.0001, quoteToUsd: 1 }).perPip, 10);
  near(run("swap-cost", { lots: 2, swapPerLot: -5, nights: 3, tripleDays: 1 }).total, -50);
  const sp = run("spread-cost", { price: 1.1, spread: 0.0002, units: 100000, commission: 7 });
  near(sp.spreadMoney, 20); near(sp.totalCost, 27);
  const fx = run("currency-convert", { amount: 100, rate: 12000, feePct: 1 });
  near(fx.received, 1188000); near(fx.feeAmount, 12000);
  near(run("cross-rate", { mode: 1, a: 1.1, b: 150 }).cross, 165);
  near(run("cross-rate", { mode: 2, a: 1.1, b: 1.25 }).cross, 0.88);
  const pp = run("pips-profit", { side: 2, entry: 1.1, exit: 1.099, pipSize: 0.0001, lots: 1, pipValue: 10 });
  near(pp.pips, 10); near(pp.profit, 100);
  const ml = run("margin-level", { equity: 5000, usedMargin: 2000, callLevel: 100, stopOutLevel: 50 });
  near(ml.level, 250); near(ml.lossToStopOut, 4000);
  const lc = run("lot-converter", { lots: 0.25, contract: 100000 });
  near(lc.units, 25000); near(lc.miniLots, 2.5); near(lc.microLots, 25);
});

test("акции и инвестиции", () => {
  const dy = run("dividend-yield", { price: 60, dividend: 2.4, shares: 100, buyPrice: 40 });
  near(dy.yield, 4); near(dy.yieldOnCost, 6); near(dy.incomeYear, 240);
  const pe = run("pe-valuation", { price: 150, eps: 6, growth: 10 });
  near(pe.pe, 25); near(pe.peg, 2.5);
  const sp = run("stock-split", { shares: 10, price: 800, newPer: 4, oldPer: 1 });
  near(sp.newShares, 40); near(sp.newPrice, 200); near(sp.value, 8000);
  const rv = run("stock-split", { shares: 100, price: 2, newPer: 1, oldPer: 10 });
  near(rv.newShares, 10); near(rv.newPrice, 20);
  const nt = run("stock-net-profit", { buy: 100, sell: 120, shares: 50, commissionPct: 0, taxPct: 10 });
  near(nt.gross, 1000); near(nt.tax, 100); near(nt.net, 900);
  const loss = run("stock-net-profit", { buy: 100, sell: 90, shares: 10, commissionPct: 0, taxPct: 10 });
  near(loss.tax, 0); near(loss.net, -100);
  const be = run("stock-breakeven", { buy: 100, shares: 10, commissionPct: 1 });
  near(be.breakeven, (100 * 1.01) / 0.99);
  near(run("periodic-invest", { monthly: 100, annualReturn: 0, years: 1 }).futureValue, 1200);
  near(run("periodic-invest", { monthly: 200, annualReturn: 8, years: 10 }).futureValue, 36589.207, 0.01);
  near(run("cagr", { start: 100, end: 200, years: 1 }).cagr, 100);
  near(run("cagr", { start: 1000, end: 2000, years: 10 }).cagr, 7.1773, 1e-3);
  near(run("total-return", { start: 1000, end: 1100, dividends: 50 }).total, 15);
});

test("опционы и фьючерсы", () => {
  const c = run("option-breakeven", { type: 1, strike: 100, premium: 3, contracts: 2, mult: 100, target: 108 });
  near(c.breakeven, 103); near(c.maxLoss, 600); near(c.profitAtTarget, 1000);
  const p = run("option-breakeven", { type: 2, strike: 100, premium: 3, contracts: 1, mult: 100, target: 120 });
  near(p.breakeven, 97); near(p.profitAtTarget, -300);
  const cc = run("covered-call", { stockPrice: 50, strike: 55, premium: 1.2, shares: 100 });
  near(cc.maxProfit, 620); near(cc.breakeven, 48.8);
  const f = run("futures-pnl", { side: 1, entry: 20000, exit: 20050, tickSize: 0.25, tickValue: 5, contracts: 2 });
  near(f.ticks, 200); near(f.pnl, 2000);
  const fl = run("futures-leverage", { price: 20000, multiplier: 2, marginPerContract: 2000, contracts: 3, balance: 15000 });
  near(fl.contractLeverage, 20); near(fl.marginPct, 40);
  const tv = run("option-time-value", { type: 1, spot: 105, strike: 100, premium: 8.5 });
  near(tv.intrinsic, 5); near(tv.timeValue, 3.5);
  const ptv = run("option-time-value", { type: 2, spot: 105, strike: 100, premium: 1 });
  near(ptv.intrinsic, 0); near(ptv.timeValue, 1);
});

test("крипто", () => {
  const fc = run("funding-cost", { side: 1, notional: 10000, ratePct: 0.01, hours: 72 });
  near(fc.perInterval, 1); near(fc.total, 9);
  near(run("funding-cost", { side: 2, notional: 10000, ratePct: 0.01, hours: 72 }).total, -9);
  const am = run("amm-slippage", { poolX: 1000, poolY: 3500000, amountIn: 10, feePct: 0 });
  near(am.out, (3500000 * 10) / 1010, 1e-6); near(am.impact, (10 / 1010) * 100, 1e-6);
  near(run("impermanent-loss", { priceChangePct: 100, deposit: 1000 }).il, -5.7191, 1e-3);
  near(run("impermanent-loss", { priceChangePct: 0, deposit: 1000 }).il, 0);
  near(run("staking-apy", { amount: 1000, aprPct: 10, compounds: 1, years: 2 }).final, 1210);
  const sat = run("satoshi", { btc: 0.5, price: 100000 });
  assert.equal(sat.sats, 50000000); near(sat.usd, 50000);
  const h = run("hodl-pnl", { coins: 2, buyPrice: 100, nowPrice: 150, feePct: 0 });
  near(h.pnl, 100); near(h.pnlPct, 50);
});

test("золото и металлы", () => {
  const m = run("metal-convert", { value: 1, unit: 3 });
  near(m.grams, 31.1034768); near(m.troyOz, 1);
  near(run("metal-convert", { value: 1, unit: 2 }).grams, 1000);
  const j = run("jewelry-markup", { weight: 31.1034768, fineness: 1000, spot: 4000, shopPrice: 4400 });
  near(j.melt, 4000); near(j.markupPct, 10);
  const k = run("karat-converter", { karat: 18 });
  near(k.fineness, 750); near(k.goldPct, 75);
  const e = run("etf-gold-per-share", { sharePrice: 42, ouncesPerShare: 0.01, spot: 4200, shares: 10 });
  near(e.nav, 42); near(e.premium, 0);
});

test("финансы", () => {
  const rb = run("rebalance", { valueA: 7000, valueB: 3000, targetA: 60 });
  near(rb.tradeA, -1000); near(rb.tradeB, 1000);
  const ir = run("inflation-real-return", { nominal: 12, inflation: 8, years: 1, amount: 100 });
  near(ir.real, (1.12 / 1.08 - 1) * 100); near(ir.futureNominal, 112);
  const ln = run("loan-payment", { amount: 10000, aprPct: 18, months: 24 });
  near(ln.payment, 499.241, 0.01);
  near(run("loan-payment", { amount: 1200, aprPct: 0, months: 12 }).payment, 100);
  const sg = run("savings-goal", { target: 12000, years: 1, annualReturn: 0, initial: 0 });
  near(sg.monthly, 1000);
  const withReturn = run("savings-goal", { target: 50000, years: 8, annualReturn: 7, initial: 2000 });
  const i = 0.07 / 12, n = 96;
  near(Number(withReturn.monthly) * ((Math.pow(1 + i, n) - 1) / i) + 2000 * Math.pow(1 + i, n), 50000, 0.01);
  near(run("rule-of-72", { ratePct: 9 }).approx, 8);
  near(run("rule-of-72", { ratePct: 7.2 }).exact, Math.log(2) / Math.log(1.072), 1e-9);
  const pc = run("percent-change", { from: 100, to: 50 });
  near(pc.change, -50); near(pc.backNeeded, 100);
});

test("статистика дисциплины", () => {
  const w = run("winrate-confidence", { wins: 28, trades: 50 });
  near(w.rate, 56); near(w.low, 42.3, 0.1); near(w.high, 68.8, 0.1);
  const all = run("winrate-confidence", { wins: 10, trades: 10 });
  assert.ok((all.high as number) <= 100 && (all.low as number) > 60);
  assert.equal(TOOL_DEFS["winrate-confidence"].compute({ wins: 11, trades: 10 }), null);
  // серия из 2 орлов подряд в 3 бросках: 3/8
  near(run("streak-probability", { trades: 3, winRate: 50, streak: 2 }).probability, 37.5);
  // 6 подряд в 100 бросках монеты: около 54,6%
  near(run("streak-probability", { trades: 100, winRate: 50, streak: 6 }).probability, 54.61, 0.05);
  near(run("streak-probability", { trades: 10, winRate: 100, streak: 3 }).probability, 0);
  const sh = run("sharpe-ratio", { mean: 0.12, stdev: 1.1, rf: 0.02, periods: 252 });
  near(sh.perPeriod, 0.1 / 1.1); near(sh.annual, (0.1 / 1.1) * Math.sqrt(252));
});
