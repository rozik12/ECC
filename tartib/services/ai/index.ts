import { OpenAIReportGenerator } from "./openai.ts";
import { RuleBasedReportGenerator } from "./rule-based.ts";
import type { WeeklyReportGenerator } from "./types.ts";

export type { ReportInput, WeeklyReportContent, WeeklyReportGenerator } from "./types.ts";
export { REPORT_SYSTEM_PROMPT } from "./prompts.ts";

/** Выбирает способ сборки отчёта: с ключом OPENAI_API_KEY — через OpenAI-заготовку, иначе по правилам. */
export function getReportGenerator(): WeeklyReportGenerator {
  return process.env.OPENAI_API_KEY ? new OpenAIReportGenerator() : new RuleBasedReportGenerator();
}
