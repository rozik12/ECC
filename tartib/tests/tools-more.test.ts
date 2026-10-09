import test from "node:test";
import assert from "node:assert/strict";
import { feeBreakeven, goalPlan, kelly, liquidation, margin, riskOfRuin, tradeProfit } from "../lib/tools.ts";
import { CALC_SLUGS, DICT_KEY, TOOL_DEFS } from "../lib/tool-defs.ts";
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
  const dicts = ["ru", "uz", "en"].map((l) => JSON.parse(readFileSync(`lib/i18n/dictionaries/${l}.json`, "utf8")).tools);
  for (const slug of CALC_SLUGS) {
    const def = TOOL_DEFS[slug];
    const values = Object.fromEntries(def.fields.map((f) => [f.id, Number(f.def)]));
    const rows = def.compute(values);
    assert.ok(rows && rows.length > 0, `${slug}: нет результата для значений по умолчанию`);
    for (const d of dicts) {
      const k = d[DICT_KEY[slug]];
      assert.ok(k?.title && k?.desc, `${slug}: нет названия`);
      for (const f of def.fields) assert.ok(k.f[f.id], `${slug}.f.${f.id}`);
      for (const r of rows) assert.ok(k.o[r.key], `${slug}.o.${r.key}`);
    }
  }
});
