import { RuleBasedReportGenerator } from "./rule-based.ts";
import type { ReportInput, WeeklyReportContent, WeeklyReportGenerator } from "./types.ts";

/**
 * Место для будущей интеграции с OpenAI (ключ в OPENAI_API_KEY, промпт в prompts.ts).
 * Пока вызова нет: отчёт собирается по правилам. Когда подключим модель, здесь появится
 * запрос к API и generatedBy станет "ai"; остальной код менять не придётся.
 */
export class OpenAIReportGenerator implements WeeklyReportGenerator {
  constructor(private readonly fallback: WeeklyReportGenerator = new RuleBasedReportGenerator()) {}

  async generate(input: ReportInput): Promise<WeeklyReportContent> {
    return this.fallback.generate(input);
  }
}
