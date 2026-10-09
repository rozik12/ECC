import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compound, drawdownRecovery, lossStreak, positionSize, riskReward, SESSIONS, sessionStatus } from "../lib/tools.ts";

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("копия инструментов в боте совпадает с сайтом", () => {
  assert.equal(readFileSync("supabase/functions/telegram-bot/tools.ts", "utf8"), readFileSync("lib/tools.ts", "utf8"));
});

test("размер позиции: пример из блога и защита от неверных данных", () => {
  const r = positionSize({ balance: 5000, riskPct: 1, entry: 100, stop: 98 });
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.riskAmount, 50); assert.equal(r.distance, 2); assert.equal(r.units, 25); assert.equal(r.value, 2500); assert.equal(r.direction, "long"); }
  const s = positionSize({ balance: 1000, riskPct: 2, entry: 50, stop: 55 });
  assert.ok(s.ok && s.direction === "short" && s.units === 4);
  for (const bad of [{ entry: 100, stop: 100 }, { entry: 0, stop: 1 }, { entry: NaN, stop: 1 }, { riskPct: 0 }, { riskPct: 101 }, { balance: -5 }])
    assert.equal(positionSize({ balance: 1000, riskPct: 1, entry: 100, stop: 98, ...bad }).ok, false);
});

test("риск к прибыли: соотношение, безубыточный процент, ожидание", () => {
  const r = riskReward({ entry: 100, stop: 98, target: 104, winRate: 40 });
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.rr, 2); near(r.breakEvenWinRate, 100 / 3); near(r.expectancyR!, 0.2); }
  const sh = riskReward({ entry: 100, stop: 105, target: 90 });
  assert.ok(sh.ok && sh.direction === "short" && sh.rr === 2 && sh.expectancyR === null);
  assert.equal(riskReward({ entry: 100, stop: 98, target: 99 }).ok, false); // цель не в сторону прибыли
  assert.equal(riskReward({ entry: 100, stop: 105, target: 101 }).ok, false);
});

test("восстановление после просадки", () => {
  near(drawdownRecovery(50)!, 100);
  near(drawdownRecovery(20)!, 25);
  assert.equal(drawdownRecovery(0), null);
  assert.equal(drawdownRecovery(100), null);
});

test("серия убытков: точные значения на малых числах", () => {
  const base = { winRate: 50, riskPct: 1 };
  const one = lossStreak({ ...base, trades: 1, streak: 1 });
  assert.ok(one.ok);
  if (one.ok) near(one.atLeastOnce, 0.5);
  const two = lossStreak({ ...base, trades: 2, streak: 2 });
  if (two.ok) near(two.atLeastOnce, 0.25);
  const three = lossStreak({ ...base, trades: 3, streak: 2 });
  if (three.ok) near(three.atLeastOnce, 0.375); // 3 из 8 цепочек содержат два убытка подряд
  const r = lossStreak({ winRate: 45, trades: 100, streak: 5, riskPct: 2 });
  assert.ok(r.ok);
  if (r.ok) { near(r.single, Math.pow(0.55, 5)); near(r.drawdownPct, (1 - Math.pow(0.98, 5)) * 100); assert.ok(r.atLeastOnce > r.single && r.atLeastOnce <= 1); }
  const sure = lossStreak({ winRate: 0, trades: 5, streak: 3, riskPct: 1 });
  if (sure.ok) near(sure.atLeastOnce, 1);
  const never = lossStreak({ winRate: 100, trades: 50, streak: 3, riskPct: 1 });
  if (never.ok) near(never.atLeastOnce, 0);
  assert.equal(lossStreak({ ...base, trades: 2.5, streak: 1 }).ok, false);
  assert.equal(lossStreak({ ...base, trades: 10, streak: 101 }).ok, false);
});

test("сложный процент: взносы в конце месяца", () => {
  const a = compound({ start: 1000, monthlyPct: 10, months: 2, monthlyDeposit: 0 });
  assert.ok(a.ok);
  if (a.ok) { near(a.final, 1210); near(a.gain, 210); }
  const b = compound({ start: 1000, monthlyPct: 10, months: 2, monthlyDeposit: 100 });
  if (b.ok) { near(b.final, 1420); assert.equal(b.deposited, 1200); }
  assert.equal(compound({ start: 1000, monthlyPct: -100, months: 2, monthlyDeposit: 0 }).ok, false);
  assert.equal(compound({ start: 1000, monthlyPct: 1, months: 0, monthlyDeposit: 0 }).ok, false);
});

test("торговые сессии: будний день, летнее время и выходные", () => {
  const st = (iso: string) => Object.fromEntries(SESSIONS.map((s) => [s.id, sessionStatus(new Date(iso), s)]));
  // Среда 10:00 UTC: в Лондоне (BST) 11:00, в Нью-Йорке (EDT) 06:00, в Токио 19:00, в Сиднее (AEDT) 21:00
  const wed = st("2026-10-07T10:00:00Z");
  assert.deepEqual(wed.london, { open: true, minutes: 360 });
  assert.deepEqual(wed.newyork, { open: false, minutes: 120 });
  assert.deepEqual(wed.tokyo, { open: false, minutes: 840 });
  assert.deepEqual(wed.sydney, { open: false, minutes: 660 });
  // Суббота 12:00 UTC: Лондон закрыт до понедельника 08:00 (по местному — 13:00 субботы)
  assert.deepEqual(st("2026-10-10T12:00:00Z").london, { open: false, minutes: 2580 });
  // Пятница после закрытия Нью-Йорка тоже ждёт понедельника
  assert.equal(st("2026-10-09T22:00:00Z").newyork.open, false);
});
