import assert from "node:assert/strict";
import { test } from "node:test";
import { RuleBasedReportGenerator } from "../services/ai/rule-based.ts";
import { REPORT_SYSTEM_PROMPT } from "../services/ai/prompts.ts";
import type { StatTrade } from "../lib/statistics/index.ts";

let n = 0;
const trade = (pnl: number, extra: Partial<StatTrade> = {}): StatTrade => ({
  id: String(++n), tradedAt: "2026-09-30T10:00:00Z", instrument: "BTC/USDT", direction: "long", entryPrice: 1, exitPrice: 1,
  pnl, emotion: "calm", rulesFollowed: true, riskAmount: 10, strategy: "", violations: [], ...extra,
});
const risk = { id: "r1", name: "Риск 1%" };

test("недельный отчёт: сделки, нарушения, частое нарушение и лучшая категория", async () => {
  const report = await new RuleBasedReportGenerator().generate({
    periodStart: "2026-09-26", periodEnd: "2026-10-02",
    trades: [
      trade(50, { instrument: "ETH/USDT" }),
      trade(30, { instrument: "ETH/USDT", emotion: "confident" }),
      trade(-40, { rulesFollowed: false, emotion: "fomo", violations: [risk] }),
      trade(-20, { rulesFollowed: false, emotion: "fomo", violations: [risk] }),
    ],
  });
  assert.equal(report.generatedBy, "rules");
  assert.equal(report.tradesCount, 4);
  assert.equal(report.violationTradesCount, 2);
  assert.equal(report.totalPnl, 20);
  assert.deepEqual(report.topViolation, { ruleId: "r1", name: "Риск 1%", count: 2, pnl: -60 });
  assert.deepEqual(report.bestCategory, { kind: "instrument", key: "ETH/USDT", pnl: 80, count: 2 });
});

test("пустая неделя не ломает отчёт", async () => {
  const report = await new RuleBasedReportGenerator().generate({ periodStart: "2026-09-26", periodEnd: "2026-10-02", trades: [] });
  assert.equal(report.tradesCount, 0);
  assert.equal(report.topViolation, null);
  assert.equal(report.bestCategory, null);
});

test("промпт запрещает сигналы и прогнозы", () => {
  assert.match(REPORT_SYSTEM_PROMPT, /NEVER give trading signals/);
  assert.match(REPORT_SYSTEM_PROMPT, /NEVER promise/);
});

import { violatesPolicy } from "../services/ai/guard.ts";

test("защита от торговых сигналов и прогнозов в ответе AI", () => {
  assert.equal(violatesPolicy("Buy now, BTC will rise tomorrow"), true);
  assert.equal(violatesPolicy("Price target is 70000"), true);
  assert.equal(violatesPolicy("Биткоин вырастет на этой неделе"), true);
  assert.equal(violatesPolicy("Гарантирую прибыль"), true);
  assert.equal(violatesPolicy("На этой неделе чаще всего нарушалось правило о риске. Стоит пересмотреть его."), false);
  assert.equal(violatesPolicy("Most trades followed the rules. Consider a break after two losses."), false);
});

import { OpenAIReportGenerator } from "../services/ai/openai.ts";

async function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  const key = process.env.OPENAI_API_KEY;
  globalThis.fetch = impl;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = key;
  }
}
const reply = (text: string) => (async () => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 })) as unknown as typeof fetch;
const input = { periodStart: "2026-09-26", periodEnd: "2026-10-02", trades: [trade(50), trade(-20, { rulesFollowed: false, violations: [risk] })], locale: "en" as const };

test("OpenAI: хороший ответ попадает в отчёт, цифры остаются по правилам", async () => {
  const report = await withFetch(reply("Most trades followed your rules. Consider reviewing the risk rule."), () => new OpenAIReportGenerator().generate(input));
  assert.equal(report.generatedBy, "ai");
  assert.match(report.summary ?? "", /reviewing the risk rule/);
  assert.equal(report.tradesCount, 2);
});

test("OpenAI: ответ с торговым сигналом отбрасывается", async () => {
  const report = await withFetch(reply("Buy now, BTC will rise"), () => new OpenAIReportGenerator().generate(input));
  assert.equal(report.generatedBy, "rules");
  assert.equal(report.summary, undefined);
});

test("OpenAI: сбой сети и ошибка API не ломают отчёт", async () => {
  const failing = (async () => { throw new Error("network"); }) as unknown as typeof fetch;
  const bad = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
  assert.equal((await withFetch(failing, () => new OpenAIReportGenerator().generate(input))).generatedBy, "rules");
  assert.equal((await withFetch(bad, () => new OpenAIReportGenerator().generate(input))).generatedBy, "rules");
});

test("OpenAI без ключа не делает запросов", async () => {
  delete process.env.OPENAI_API_KEY;
  let called = false;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { called = true; return new Response("{}"); }) as unknown as typeof fetch;
  try {
    assert.equal((await new OpenAIReportGenerator().generate(input)).generatedBy, "rules");
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(called, false);
});
