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

/** Момент, когда в часовом поясе tz на часах показано указанное местное время. Работает и в дни перехода на летнее время. */
export function zonedTime(tz: string, year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let t = guess - offsetMs(tz, new Date(guess));
  const second = guess - offsetMs(tz, new Date(t));
  if (second !== t) t = second;
  return new Date(t);
}

/** Момент, когда в часовом поясе tz наступает полночь указанной даты. */
export function startOfLocalDay(tz: string, year: number, month: number, day: number): Date {
  return zonedTime(tz, year, month, day);
}

/** Значение поля datetime-local («2026-10-09T14:30»), введённое в часовом поясе tz → момент времени. Неверное значение → null. */
export function zonedInputToDate(tz: string, value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const d = zonedTime(safeTimeZone(tz), +m[1], +m[2], +m[3], +m[4], +m[5]);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Момент времени → значение для поля datetime-local в часовом поясе tz. */
export function dateToZonedInput(tz: string, date: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: safeTimeZone(tz), hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
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
