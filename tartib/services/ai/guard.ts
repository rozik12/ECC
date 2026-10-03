/**
 * Проверка ответа AI: в тексте не должно быть торговых сигналов, прогнозов и обещаний прибыли.
 * Если что-то нашлось, ответ отбрасывается и остаётся отчёт, собранный по правилам.
 */
const FORBIDDEN: RegExp[] = [
  /\b(buy|sell|short|long)\s+(now|today|here|at)\b/i,
  /\b(will|going to)\s+(rise|fall|drop|go up|go down|rally|crash)\b/i,
  /\bprice target\b/i,
  /\bguarantee[sd]?\b/i,
  /\b(entry|exit)\s+(at|level|point)\b/i,
  /купи(ть|те)?\s+(сейчас|сегодня|на)/i,
  /прода(й|вай|йте)\s+(сейчас|сегодня|на)/i,
  /(вырастет|упадёт|упадет|обвалится|взлетит)/i,
  /гаранти(рую|я|рованн)/i,
  /(sotib\s+ol|sot\b|narx\s+(ko'tariladi|tushadi))/i,
];

export function violatesPolicy(text: string): boolean {
  return FORBIDDEN.some((re) => re.test(text));
}
