import { violatesPolicy } from "./guard.ts";
import { REPORT_SYSTEM_PROMPT } from "./prompts.ts";
import { RuleBasedReportGenerator } from "./rule-based.ts";
import type { ReportInput, WeeklyReportContent, WeeklyReportGenerator } from "./types.ts";

const LANGUAGE: Record<string, string> = { ru: "Russian", uz: "Uzbek (Latin script)", en: "English" };

/**
 * Недельный отчёт с текстовым разбором от OpenAI (ключ в OPENAI_API_KEY, модель в OPENAI_MODEL).
 * Цифры всегда считаются по правилам; модель только пишет короткий разбор поведения по этим цифрам.
 * При любой ошибке, таймауте или нарушении политики (сигналы, прогнозы) остаётся отчёт без AI.
 */
export class OpenAIReportGenerator implements WeeklyReportGenerator {
  private readonly fallback: WeeklyReportGenerator;

  constructor(fallback: WeeklyReportGenerator = new RuleBasedReportGenerator()) {
    this.fallback = fallback;
  }

  async generate(input: ReportInput): Promise<WeeklyReportContent> {
    const base = await this.fallback.generate(input);
    const key = process.env.OPENAI_API_KEY;
    if (!key || base.tradesCount === 0) return base;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const facts = {
        period: `${base.periodStart} — ${base.periodEnd}`,
        trades: base.tradesCount,
        tradesWithRuleViolations: base.violationTradesCount,
        totalPnl: base.totalPnl,
        mostViolatedRule: base.topViolation && { name: base.topViolation.name, times: base.topViolation.count, pnlOfThoseTrades: base.topViolation.pnl },
        bestCategory: base.bestCategory,
      };
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
          temperature: 0.3,
          max_tokens: 350,
          messages: [
            { role: "system", content: REPORT_SYSTEM_PROMPT },
            { role: "user", content: `Write in ${LANGUAGE[input.locale ?? "en"] ?? "English"}. Facts (JSON):\n${JSON.stringify(facts)}` },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) return base;
      const json = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const text = json.choices?.[0]?.message?.content?.trim();
      if (!text || text.length > 2000 || violatesPolicy(text)) return base;
      return { ...base, generatedBy: "ai", summary: text };
    } catch {
      return base;
    } finally {
      clearTimeout(timer);
    }
  }
}
