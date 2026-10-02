// Границы «сегодня» в часовом поясе пользователя.

export function safeTimeZone(tz: string | null | undefined): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz ?? "UTC" });
    return tz ?? "UTC";
  } catch {
    return "UTC";
  }
}

function offsetMs(tz: string, date: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Момент, когда в часовом поясе tz наступает полночь указанной даты. */
export function startOfLocalDay(tz: string, year: number, month: number, day: number): Date {
  const guess = Date.UTC(year, month - 1, day);
  let t = guess - offsetMs(tz, new Date(guess));
  const second = guess - offsetMs(tz, new Date(t));
  if (second !== t) t = second;
  return new Date(t);
}

function localYmd(tz: string, date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return { y: +parts.year, m: +parts.month, d: +parts.day };
}

/** Начало и конец (не включая) того дня, в который попадает date, в поясе tz. */
export function dayBounds(tz: string, date: Date = new Date()): { start: Date; end: Date } {
  const zone = safeTimeZone(tz);
  const { y, m, d } = localYmd(zone, date);
  const start = startOfLocalDay(zone, y, m, d);
  const next = new Date(Date.UTC(y, m - 1, d) + 24 * 3600 * 1000);
  const end = startOfLocalDay(zone, next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  return { start, end };
}

/** «2026-10-03» → начало этого дня в поясе tz. */
export function dateInputToStart(tz: string, value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return startOfLocalDay(safeTimeZone(tz), +match[1], +match[2], +match[3]);
}
