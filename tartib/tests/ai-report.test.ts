import assert from "node:assert/strict";
import { test } from "node:test";
import { RuleBasedReportGenerator } from "../services/ai/rule-based.ts";
import { REPORT_SYSTEM_PROMPT } from "../services/ai/prompts.ts";
import type { StatTrade } from "../lib/statistics/index.ts";

let n = 0;
const trade = (pnl: number, extra: Partial<StatTrade> = {}): StatTrade => ({
  id: String(++n), tradedAt: "2026-09-30T10:00:00Z", instrument: "BTC/USDT", direction: "long", entryPrice: 1, exitPrice: 1,
  pnl, emotion: "calm", rulesFollowed: true, riskAmount: 10, violations: [], ...extra,
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
