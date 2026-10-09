// Экраны и кнопки бота. Чистые функции: получают данные, возвращают текст и клавиатуру.
import { computeAchievements, disciplineCost, disciplineStreak, byEmotion, monthDiscipline, pnlByInstrument, summarize, topViolations, type StatTrade } from "./stats.ts";
import { emotionKeys, emotionLabel, tr, type Lang } from "./text.ts";

export type Btn = { text: string; callback_data?: string; url?: string };
export type Kb = { inline_keyboard: Btn[][] };
export type Screen = { text: string; kb?: Kb };

export type TradeRow = {
  id: string; instrument: string; direction: "long" | "short"; entry: number; exit: number | null; stop: number | null; tp: number | null;
  size: number; leverage: number; fees: number; pnl: number; emotion: string; strategy: string; comment: string;
  followed: boolean; at: string; violations: { id: string; name: string }[];
};
export type RuleRow = { id: string; name: string; rule_type: string; is_active: boolean };
export type AccountRow = { id: string; name: string; currency: string; balance: number };
export type LinkSettings = { reminders: boolean; daily: boolean; weekly: boolean };

const LOCALE: Record<Lang, string> = { ru: "ru-RU", en: "en-US", uz: "uz-UZ" };
export const PAGE_SIZE = 5;
export const SITE = "https://tartib.uk";

/** Экранирование пользовательского текста для parse_mode HTML. */
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const num = (n: number, lang: Lang, digits = 2) => new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: digits }).format(n);
export const money = (n: number, cur: string, lang: Lang, signed = false) => `${signed && n > 0 ? "+" : ""}${num(n, lang)} ${cur}`.trim();
const pnlDot = (n: number) => (n > 0 ? "🟢" : n < 0 ? "🔴" : "⚪");
const dirDot = (d: string) => (d === "long" ? "🟢" : "🔴");

export function fmtDate(iso: string, tz: string, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

const b = (text: string, callback_data: string): Btn => ({ text, callback_data });
const kb = (...rows: Btn[][]): Kb => ({ inline_keyboard: rows });
const menuRow = (lang: Lang): Btn[] => [b(tr(lang, "menu"), "m:menu")];

export const toStat = (t: TradeRow): StatTrade => ({
  id: t.id, tradedAt: t.at, instrument: t.instrument, direction: t.direction, entryPrice: t.entry, exitPrice: t.exit, pnl: t.pnl,
  emotion: t.emotion, rulesFollowed: t.followed, riskAmount: null, strategy: t.strategy, violations: t.violations,
});

// ---------- главное меню ----------
export function mainMenu(lang: Lang): Screen {
  return {
    text: tr(lang, "menuTitle"),
    kb: kb(
      [b(tr(lang, "mNew"), "m:new"), b(tr(lang, "mRepeat"), "m:repeat")],
      [b(tr(lang, "mOpen"), "o:0"), b(tr(lang, "mLast"), "l:0")],
      [b(tr(lang, "mToday"), "s:today"), b(tr(lang, "mStats"), "m:stats")],
      [b(tr(lang, "mAch"), "m:ach"), b(tr(lang, "mCheck"), "m:check")],
      [b(tr(lang, "mRules"), "m:rules"), b(tr(lang, "mAcc"), "m:acc")],
      [b(tr(lang, "mSettings"), "m:set"), b(tr(lang, "mHelp"), "h:menu")],
      [{ text: tr(lang, "mSite"), url: SITE + "/dashboard" }],
    ),
  };
}

/** Постоянная клавиатура внизу чата. */
export function replyMenu(lang: Lang) {
  const k = (key: string) => ({ text: tr(lang, key) });
  return { keyboard: [[k("kNew"), k("kToday")], [k("kStats"), k("kTrades")], [k("kSettings"), k("kHelp")]], resize_keyboard: true, is_persistent: true };
}

// ---------- сделки ----------
export function tradeLine(lang: Lang, t: TradeRow): string {
  return `${dirDot(t.direction)} <b>${esc(t.instrument)}</b> ${t.direction.toUpperCase()} · ${t.entry} × ${t.size}${t.exit !== null ? ` → ${t.exit}` : ""}`;
}

export function tradeCard(lang: Lang, t: TradeRow, cur: string, tz: string): string {
  const d = tr(lang, "dash");
  const rules = t.followed ? "✓" : `⚠ ${t.violations.map((v) => esc(v.name)).join(", ") || tr(lang, "none")}`;
  return tr(lang, "card", {
    dir: dirDot(t.direction), instrument: esc(t.instrument), DIR: t.direction.toUpperCase(), entry: t.entry, size: t.size,
    stop: t.stop ?? d, tp: t.tp ?? d, exit: t.exit ?? tr(lang, "openWord"), pnl: money(t.pnl, cur, lang, true),
    emotion: emotionLabel(lang, t.emotion), strategy: t.strategy ? esc(t.strategy) : d, rules, comment: t.comment ? esc(t.comment) : d, date: fmtDate(t.at, tz, lang),
  });
}

export function tradeActions(lang: Lang, t: TradeRow, back = "l:0"): Kb {
  const rows: Btn[][] = [];
  if (t.exit === null) rows.push([b(tr(lang, "bClose"), `tc:${t.id}`)]);
  rows.push([b(tr(lang, "bEmotion"), `te:${t.id}`), b(tr(lang, "bComment"), `tm:${t.id}`)]);
  rows.push([b(tr(lang, "bStrategy"), `ts:${t.id}`), b(tr(lang, "bRulesMark"), `tr:${t.id}`)]);
  rows.push([b(tr(lang, "bDelete"), `td:${t.id}`), { text: tr(lang, "bOpenSite"), url: `${SITE}/trades/${t.id}` }]);
  rows.push([b(tr(lang, "back"), back), ...menuRow(lang)]);
  return kb(...rows);
}

/** Кнопки под только что записанной сделкой. */
export function savedActions(lang: Lang, t: TradeRow): Kb {
  const rows: Btn[][] = [];
  if (t.exit === null) rows.push([b(tr(lang, "bClose"), `tc:${t.id}`), b(tr(lang, "bEmotion"), `te:${t.id}`)]);
  else rows.push([b(tr(lang, "bEmotion"), `te:${t.id}`)]);
  rows.push([b(tr(lang, "bComment"), `tm:${t.id}`), b(tr(lang, "bStrategy"), `ts:${t.id}`)]);
  rows.push([b(tr(lang, "bDetails"), `t:${t.id}`), b(tr(lang, "bDelete"), `td:${t.id}`)]);
  rows.push(menuRow(lang));
  return kb(...rows);
}

const shortLabel = (lang: Lang, t: TradeRow, cur: string) =>
  `${pnlDot(t.pnl)} ${t.instrument} ${t.direction === "long" ? "L" : "S"} ${t.exit === null ? tr(lang, "openWord") : money(t.pnl, "", lang, true).trim()} ${t.followed ? "✓" : "⚠"}`.slice(0, 60) + (cur ? "" : "");

export function tradesList(lang: Lang, rows: TradeRow[], page: number, total: number, cur: string, kind: "l" | "o"): Screen {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const empty = total === 0;
  const title = kind === "l" ? tr(lang, "lastTitle", { p: page + 1, pp: pages }) : tr(lang, "openTitle", { n: total });
  const buttons = rows.map((t) => [b(shortLabel(lang, t, cur), `t:${t.id}`)]);
  const nav: Btn[] = [];
  if (page > 0) nav.push(b("◀", `${kind}:${page - 1}`));
  nav.push(b(`${page + 1}/${pages}`, `${kind}:${page}`));
  if (page + 1 < pages) nav.push(b("▶", `${kind}:${page + 1}`));
  return { text: empty ? tr(lang, kind === "l" ? "lastEmpty" : "openEmpty") : title, kb: kb(...buttons, ...(empty ? [] : [nav]), menuRow(lang)) };
}

export function emotionPicker(lang: Lang, prefix: string, back: string): Kb {
  const rows: Btn[][] = [];
  for (let i = 0; i < emotionKeys.length; i += 2) {
    rows.push(emotionKeys.slice(i, i + 2).map((k) => b(emotionLabel(lang, k), `${prefix}${k}`)));
  }
  rows.push([b(tr(lang, "cancel"), back)]);
  return kb(...rows);
}

export function strategyPicker(lang: Lang, recent: string[], id: string): Kb {
  const rows: Btn[][] = recent.slice(0, 6).map((s, i) => [b(s.slice(0, 40), `tss:${id}:${i}`)]);
  rows.push([b(tr(lang, "cancel"), `t:${id}`)]);
  return kb(...rows);
}

export function rulesMark(lang: Lang, id: string, custom: RuleRow[], marked: Set<string>): Screen {
  if (custom.length === 0) return { text: tr(lang, "rulesMarkNone"), kb: kb([b(tr(lang, "back"), `t:${id}`)]) };
  return {
    text: tr(lang, "rulesMarkTitle"),
    kb: kb(...custom.map((r, i) => [b(`${marked.has(r.id) ? "⚠️" : "▫️"} ${r.name}`.slice(0, 60), `trt:${id}:${i}`)]), [b(tr(lang, "back"), `t:${id}`)]),
  };
}

export function deleteAsk(lang: Lang, t: TradeRow): Screen {
  return { text: tr(lang, "deleteAsk", { line: tradeLine(lang, t) }), kb: kb([b(tr(lang, "bDelete"), `tdy:${t.id}`), b(tr(lang, "cancel"), `t:${t.id}`)]) };
}

// ---------- мастер новой сделки ----------
export type Draft = { instrument?: string; direction?: "long" | "short"; entry?: number; size?: number; stop?: number | null; exit?: number | null; emotion?: string };

export function draftSummary(lang: Lang, d: Draft): string {
  const dash = tr(lang, "dash");
  return [
    `${tr(lang, "fInstrument")}: <b>${esc(d.instrument ?? dash)}</b>`,
    `${tr(lang, "fDirection")}: ${d.direction ? `${dirDot(d.direction)} ${d.direction.toUpperCase()}` : dash}`,
    `${tr(lang, "fEntry")}: ${d.entry ?? dash} · ${tr(lang, "fSize")}: ${d.size ?? dash}`,
    `${tr(lang, "fStop")}: ${d.stop ?? dash} · ${tr(lang, "fExit")}: ${d.exit ?? tr(lang, "openWord")}`,
    `${tr(lang, "fEmotion")}: ${d.emotion ? emotionLabel(lang, d.emotion) : dash}`,
  ].join("\n");
}

export function wizardScreen(lang: Lang, step: string, recent: string[]): Screen {
  const cancel = b(tr(lang, "cancel"), "n:cancel");
  switch (step) {
    case "instrument":
      return { text: tr(lang, "wizInstrument"), kb: kb(...recent.slice(0, 6).reduce<Btn[][]>((rows, s, i) => { if (i % 2 === 0) rows.push([]); rows[rows.length - 1].push(b(s, `n:i:${i}`)); return rows; }, []), [cancel]) };
    case "direction":
      return { text: tr(lang, "wizDirection"), kb: kb([b("🟢 LONG", "n:d:long"), b("🔴 SHORT", "n:d:short")], [cancel]) };
    case "entry": return { text: tr(lang, "wizEntry"), kb: kb([cancel]) };
    case "size": return { text: tr(lang, "wizSize"), kb: kb([cancel]) };
    case "stop": return { text: tr(lang, "wizStop"), kb: kb([b(tr(lang, "skip"), "n:skip")], [cancel]) };
    case "exit": return { text: tr(lang, "wizExit"), kb: kb([b(tr(lang, "skip"), "n:skip")], [cancel]) };
    case "emotion": return { text: tr(lang, "wizEmotion"), kb: emotionPicker(lang, "n:e:", "n:cancel") };
    default: return { text: tr(lang, "wizCancelled"), kb: kb(menuRow(lang)) };
  }
}

export function wizardConfirm(lang: Lang, d: Draft): Screen {
  return {
    text: tr(lang, "wizConfirm", { summary: draftSummary(lang, d) }),
    kb: kb([b(tr(lang, "save"), "n:save")], [b("✏️ " + tr(lang, "wizEditWhat"), "n:edit"), b(tr(lang, "cancel"), "n:cancel")]),
  };
}

export function wizardEdit(lang: Lang): Screen {
  const f = (key: string, field: string) => b(tr(lang, key), `n:f:${field}`);
  return {
    text: tr(lang, "wizEditWhat"),
    kb: kb([f("fInstrument", "instrument"), f("fDirection", "direction")], [f("fEntry", "entry"), f("fSize", "size")], [f("fStop", "stop"), f("fExit", "exit")], [f("fEmotion", "emotion")], [b(tr(lang, "back"), "n:review")]),
  };
}

// ---------- статистика ----------
export function statsMenu(lang: Lang): Screen {
  const s = (key: string, data: string) => b(tr(lang, key), data);
  return {
    text: tr(lang, "statsMenu"),
    kb: kb([s("sToday", "s:today"), s("sWeek", "s:week")], [s("sMonth", "s:month"), s("sAll", "s:all")], [s("sDiscipline", "s:disc")], [s("sStreak", "s:streak"), s("sGoal", "s:goal")], [s("sViol", "s:viol"), s("sEmo", "s:emo")], [s("sInstr", "s:instr")], menuRow(lang)),
  };
}

const statsNav = (lang: Lang, self: string): Kb => kb([b(tr(lang, "refresh"), self), b(tr(lang, "back"), "m:stats")], menuRow(lang));
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);

export function periodReport(lang: Lang, self: string, title: string, rows: TradeRow[], cur: string): Screen {
  if (rows.length === 0) return { text: `📊 <b>${title}</b>\n${tr(lang, "repEmpty")}`, kb: statsNav(lang, self) };
  const s = summarize(rows.map(toStat));
  const followed = rows.filter((t) => t.followed).length;
  return {
    text: tr(lang, "repPeriod", {
      title, n: s.totalTrades, followed, pct: pct((followed / s.totalTrades) * 100), pnl: money(s.totalPnl, cur, lang, true), wr: pct(s.winRate),
      pf: s.profitFactor === null ? "—" : num(s.profitFactor, lang), aw: s.avgWin === null ? "—" : money(s.avgWin, cur, lang), al: s.avgLoss === null ? "—" : money(s.avgLoss, cur, lang),
    }),
    kb: statsNav(lang, self),
  };
}

export function disciplineScreen(lang: Lang, rows: TradeRow[], cur: string): Screen {
  const d = disciplineCost(rows.map(toStat));
  const tail = rows.length === 0 ? tr(lang, "repEmpty") : d.violatedCount === 0 ? tr(lang, "discNone") : d.cost > 0 ? tr(lang, "discCost", { cost: money(d.cost, cur, lang) }) : tr(lang, "discNoLoss");
  return {
    text: `${tr(lang, "discTitle", { fp: money(d.followedPnl, cur, lang, true), fc: d.followedCount, vp: money(d.violatedPnl, cur, lang, true), vc: d.violatedCount })}\n\n${tail}`,
    kb: statsNav(lang, "s:disc"),
  };
}

export function streakScreen(lang: Lang, all: TradeRow[]): Screen {
  const s = disciplineStreak(all.map(toStat));
  return { text: tr(lang, "streakText", { cur: s.current, best: s.best, days: s.daysSinceViolation === null ? tr(lang, "streakNever") : s.daysSinceViolation }), kb: statsNav(lang, "s:streak") };
}

export function goalScreen(lang: Lang, all: TradeRow[], goal: number, tz: string): Screen {
  const g = monthDiscipline(all.map(toStat), goal, tz);
  const tail = g.percent === null ? tr(lang, "goalNone") : g.reached ? tr(lang, "goalReached") : g.needed !== null ? tr(lang, "goalLeft", { n: g.needed }) : "";
  return { text: `${tr(lang, "goalText", { goal, pct: pct(g.percent), f: g.followed, t: g.total })}\n${tail}`, kb: statsNav(lang, "s:goal") };
}

export function violationsScreen(lang: Lang, rows: TradeRow[]): Screen {
  const v = topViolations(rows.map(toStat), 7);
  const body = v.length === 0 ? tr(lang, "violNone") : v.map((x, i) => `${i + 1}. ${esc(x.name)}: ${tr(lang, "times", { n: x.count })}`).join("\n");
  return { text: `${tr(lang, "violTitle")}\n\n${body}`, kb: statsNav(lang, "s:viol") };
}

export function emotionsScreen(lang: Lang, rows: TradeRow[], cur: string): Screen {
  const e = byEmotion(rows.map(toStat));
  const body = e.length === 0 ? tr(lang, "repEmpty") : e.map((x) => `${emotionLabel(lang, x.emotion)}: ${tr(lang, "tradesShort", { n: x.count })}, Σ ${money(x.total, cur, lang, true)}, ⌀ ${money(x.average, cur, lang, true)}`).join("\n");
  return { text: `${tr(lang, "emoTitle")}\n\n${body}`, kb: statsNav(lang, "s:emo") };
}

export function instrumentsScreen(lang: Lang, rows: TradeRow[], cur: string): Screen {
  const p = pnlByInstrument(rows.map(toStat)).slice(0, 8);
  const body = p.length === 0 ? tr(lang, "repEmpty") : p.map((x) => `${pnlDot(x.pnl)} ${esc(x.key)}: ${money(x.pnl, cur, lang, true)} (${tr(lang, "tradesShort", { n: x.count })})`).join("\n");
  return { text: `${tr(lang, "instrTitle")}\n\n${body}`, kb: statsNav(lang, "s:instr") };
}

export function achievementsScreen(lang: Lang, all: TradeRow[]): Screen {
  const a = computeAchievements(all.map(toStat));
  const done = a.filter((x) => x.unlocked).length;
  const body = a.map((x) => `${x.unlocked ? "🏅" : "🔒"} ${tr(lang, `ach_${x.id}`)}${x.unlocked ? "" : ` (${x.current}/${x.target})`}`).join("\n");
  return { text: `${tr(lang, "achTitle", { done, total: a.length })}\n\n${body}`, kb: kb([b(tr(lang, "refresh"), "m:ach")], menuRow(lang)) };
}

// ---------- счета, правила, настройки, чек-лист, помощь ----------
export function accountsScreen(lang: Lang, accs: AccountRow[], activeId: string | null): Screen {
  const active = activeId ?? accs[0]?.id;
  const body = accs.map((a) => `${a.id === active ? "✅ " : "▫️ "}${tr(lang, "accBalance", { name: esc(a.name), balance: money(a.balance, a.currency, lang) })}`).join("\n");
  return { text: `${tr(lang, "accTitle")}\n\n${body}`, kb: kb(...accs.map((a, i) => [b(`${a.id === active ? "✅ " : ""}${a.name}`.slice(0, 50), `c:acc:${i}`)]), menuRow(lang)) };
}

export function rulesScreen(lang: Lang, rules: RuleRow[]): Screen {
  if (rules.length === 0) return { text: tr(lang, "rulesEmpty"), kb: kb(menuRow(lang)) };
  return { text: tr(lang, "rulesTitle"), kb: kb(...rules.map((r, i) => [b(`${r.is_active ? tr(lang, "ruleOn") : tr(lang, "ruleOff")} ${r.name}`.slice(0, 60), `r:${i}`)]), menuRow(lang)) };
}

export function settingsScreen(lang: Lang, s: LinkSettings, accountName: string): Screen {
  const on = (v: boolean) => (v ? tr(lang, "on") : tr(lang, "off"));
  const text = [
    tr(lang, "setTitle"), "",
    `🌐 ${tr(lang, "setLang")}: ${lang.toUpperCase()}`,
    `🔔 ${tr(lang, "setRem")}: ${on(s.reminders)}`,
    `🌙 ${tr(lang, "setDaily")}: ${on(s.daily)}`,
    `📅 ${tr(lang, "setWeekly")}: ${on(s.weekly)}`,
    `💼 ${tr(lang, "setAcc")}: ${esc(accountName)}`,
  ].join("\n");
  return {
    text,
    kb: kb(
      [b(`🔔 ${on(s.reminders)}`, "c:rem"), b(`🌙 ${on(s.daily)}`, "c:daily"), b(`📅 ${on(s.weekly)}`, "c:weekly")],
      [b(tr(lang, "bLang"), "c:lang"), b(tr(lang, "bAcc"), "m:acc")],
      [b(tr(lang, "bExport"), "x:csv"), b(tr(lang, "bUnlink"), "c:unlink")],
      menuRow(lang),
    ),
  };
}

export function languagePicker(lang: Lang): Screen {
  return { text: `🌐 ${tr(lang, "setLang")}`, kb: kb([b("🇷🇺 Русский", "c:lang:ru"), b("🇺🇿 O'zbek", "c:lang:uz"), b("🇬🇧 English", "c:lang:en")], [b(tr(lang, "back"), "m:set")]) };
}

export function unlinkAsk(lang: Lang): Screen {
  return { text: tr(lang, "unlinkAsk"), kb: kb([b(tr(lang, "yes"), "c:unlinkok"), b(tr(lang, "no"), "m:set")]) };
}

export function checklistScreen(lang: Lang, keys: string[], checked: number[]): Screen {
  const label = (k: string) => { const t = tr(lang, `check_${k}`); return t === `check_${k}` ? k : t; };
  const all = keys.length > 0 && keys.every((_, i) => checked.includes(i));
  return {
    text: all ? `${tr(lang, "checkTitle")}\n\n${tr(lang, "checkDone")}` : tr(lang, "checkTitle"),
    kb: kb(...keys.map((k, i) => [b(`${checked.includes(i) ? "☑️" : "⬜"} ${label(k)}`.slice(0, 60), `k:${i}`)]), [b(tr(lang, "refresh"), "k:reset")], menuRow(lang)),
  };
}

export function helpMenu(lang: Lang): Screen {
  return { text: tr(lang, "helpTitle"), kb: kb([b(tr(lang, "hFormat"), "h:fmt")], [b(tr(lang, "hCmds"), "h:cmds")], [b(tr(lang, "hBtns"), "h:btns")], [b(tr(lang, "hAbout"), "h:about")], menuRow(lang)) };
}

export function helpTopic(lang: Lang, topic: string): Screen {
  const key = { fmt: "helpFormat", cmds: "helpCmds", btns: "helpBtns", about: "helpAbout" }[topic] ?? "helpAbout";
  return { text: `${tr(lang, key)}\n\n<i>${tr(lang, "disclaimer")}</i>`, kb: kb([b(tr(lang, "back"), "h:menu")], menuRow(lang)) };
}

export function unknownScreen(lang: Lang): Screen {
  const m = mainMenu(lang);
  return { text: `${tr(lang, "unknown")}\n\n${tr(lang, "example")}`, kb: m.kb };
}

// ---------- выгрузка ----------
const csvText = (s: string) => { const v = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; return `"${v.replace(/"/g, '""')}"`; };

export function tradesCsv(rows: TradeRow[]): string {
  const head = ["date", "instrument", "direction", "entry", "exit", "stop", "take_profit", "size", "leverage", "fees", "pnl", "emotion", "strategy", "rules_followed", "violated_rules", "comment"];
  const lines = rows.map((t) => [
    t.at, csvText(t.instrument), t.direction, t.entry, t.exit ?? "", t.stop ?? "", t.tp ?? "", t.size, t.leverage, t.fees, t.pnl, t.emotion, csvText(t.strategy),
    t.followed ? "yes" : "no", csvText(t.violations.map((v) => v.name).join(" | ")), csvText(t.comment),
  ].join(","));
  return "﻿" + [head.join(","), ...lines].join("\n") + "\n";
}
