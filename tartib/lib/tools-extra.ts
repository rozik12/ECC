// 50 дополнительных калькуляторов (все публичные, считаются в браузере). Формулы простые и проверяются тестами (tests/tools-extra.test.ts).
// Подписи лежат в словаре в разделе toolsx.<key> (title, desc, note, f, c, o) и на странице передаются серверу, а не в браузер целиком.
import { TROY_OZ_GRAMS } from "./tools.ts";

export type XGroup = "risk" | "forex" | "stocks" | "derivs" | "crypto" | "metals" | "finance" | "stats";
export const X_GROUPS: XGroup[] = ["risk", "forex", "stocks", "derivs", "crypto", "metals", "finance", "stats"];

export type XRow = { key: string; value: number | string; fmt: "num" | "money" | "pct" | "ratio" | "text" | "int"; tone?: "good" | "bad" };
export type XField = { id: string; def: string; optional?: boolean; choices?: number[] };
type V = Record<string, number | null>;
export type XDef = { key: string; group: XGroup; fields: XField[]; compute: (v: V) => XRow[] | null };

const g = (x: number | null | undefined) => x ?? NaN;
const fin = (...a: number[]) => a.every((x) => Number.isFinite(x));
const pos = (...a: number[]) => a.every((x) => Number.isFinite(x) && x > 0);
const nn = (...a: number[]) => a.every((x) => Number.isFinite(x) && x >= 0);
const row = (key: string, value: number | string, fmt: XRow["fmt"] = "num", tone?: XRow["tone"]): XRow => ({ key, value, fmt, tone });
const sign = (side: number) => (side === 2 ? -1 : 1);
const tone = (x: number): XRow["tone"] => (x > 0 ? "good" : x < 0 ? "bad" : undefined);
const F = (id: string, def: string, extra: Partial<XField> = {}): XField => ({ id, def, ...extra });
const SIDE = F("side", "1", { choices: [1, 2] });

/** Любая нечисловая или бесконечная цифра в результате значит «значения не подходят». */
const guard = (rows: XRow[] | null): XRow[] | null => (rows && rows.every((r) => typeof r.value === "string" || Number.isFinite(r.value)) ? rows : null);

const DEFS: Record<string, XDef> = {
  // ---------- Риск и размер ----------
  "breakeven-winrate": {
    key: "bewr", group: "risk",
    fields: [F("rr", "2"), F("costR", "0")],
    compute: (v) => {
      const rr = g(v.rr), c = g(v.costR);
      if (!pos(rr) || !nn(c)) return null;
      const p = (1 + c) / (rr + 1);
      return [row("winRate", p * 100, "pct"), row("lossRate", (1 - p) * 100, "pct"), row("winsPer10", p * 10)];
    },
  },
  expectancy: {
    key: "expect", group: "risk",
    fields: [F("winRate", "45"), F("avgWin", "200"), F("avgLoss", "100")],
    compute: (v) => {
      const w = g(v.winRate) / 100, aw = g(v.avgWin), al = g(v.avgLoss);
      if (!fin(w) || w < 0 || w > 1 || !pos(aw, al)) return null;
      const e = w * aw - (1 - w) * al;
      const rows = [row("expectancy", e, "num", tone(e)), row("expectancyR", e / al, "num", tone(e)), row("payoff", aw / al, "ratio"), row("per100", e * 100, "num", tone(e))];
      if (w < 1) rows.push(row("profitFactor", (w * aw) / ((1 - w) * al)));
      return rows;
    },
  },
  "profit-factor": {
    key: "pfactor", group: "risk",
    fields: [F("grossProfit", "5000"), F("grossLoss", "3200")],
    compute: (v) => {
      const gp = g(v.grossProfit), gl = g(v.grossLoss);
      if (!nn(gp) || !pos(gl)) return null;
      const pf = gp / gl;
      return [row("profitFactor", pf, "num", pf > 1 ? "good" : pf < 1 ? "bad" : undefined), row("net", gp - gl, "num", tone(gp - gl)), row("lossShare", (gl / (gp + gl)) * 100, "pct")];
    },
  },
  "r-multiple": {
    key: "rmult", group: "risk",
    fields: [F("entry", "100"), F("stop", "98"), F("exit", "105"), F("size", "10")],
    compute: (v) => {
      const e = g(v.entry), s = g(v.stop), x = g(v.exit), q = g(v.size);
      if (!pos(e, s, q) || !fin(x) || e === s) return null;
      const dir = e > s ? 1 : -1;
      const r = ((x - e) * dir) / Math.abs(e - s);
      return [row("direction", dir === 1 ? "long" : "short", "text"), row("r", r, "num", tone(r)), row("riskMoney", q * Math.abs(e - s)), row("pnl", (x - e) * dir * q, "num", tone(r))];
    },
  },
  "daily-loss-limit": {
    key: "dailylimit", group: "risk",
    fields: [F("balance", "10000"), F("dailyLossPct", "3"), F("riskPct", "1")],
    compute: (v) => {
      const b = g(v.balance), d = g(v.dailyLossPct), r = g(v.riskPct);
      if (!pos(b, d, r) || d > 100 || r > 100) return null;
      return [row("limitMoney", (b * d) / 100), row("riskMoney", (b * r) / 100), row("lossesToLimit", Math.floor(d / r), "int")];
    },
  },
  exposure: {
    key: "exposure", group: "risk",
    fields: [F("balance", "5000"), F("price", "50"), F("quantity", "200"), F("leverage", "5")],
    compute: (v) => {
      const b = g(v.balance), p = g(v.price), q = g(v.quantity), l = g(v.leverage);
      if (!pos(b, p, q, l) || l < 1) return null;
      const notional = p * q;
      return [row("notional", notional), row("exposurePct", (notional / b) * 100, "pct"), row("effLeverage", notional / b), row("marginNeeded", notional / l)];
    },
  },
  "partial-close": {
    key: "partial", group: "risk",
    fields: [SIDE, F("entry", "100"), F("exit", "106"), F("quantity", "10"), F("closePct", "50")],
    compute: (v) => {
      const s = sign(g(v.side)), e = g(v.entry), x = g(v.exit), q = g(v.quantity), c = g(v.closePct);
      if (!pos(e, x, q, c) || c > 100) return null;
      const closed = (q * c) / 100, rest = q - closed;
      const realized = (x - e) * s * closed;
      return [row("closedQty", closed), row("remainingQty", rest), row("realized", realized, "num", tone(realized)), row("remainingAtExit", (x - e) * s * rest, "num", tone((x - e) * s))];
    },
  },
  "atr-stop": {
    key: "atrstop", group: "risk",
    fields: [SIDE, F("entry", "100"), F("atr", "1.5"), F("mult", "2")],
    compute: (v) => {
      const s = sign(g(v.side)), e = g(v.entry), a = g(v.atr), m = g(v.mult);
      if (!pos(e, a, m)) return null;
      const d = a * m, stop = e - s * d;
      if (stop <= 0) return null;
      return [row("stop", stop), row("distance", d), row("distancePct", (d / e) * 100, "pct"), row("target2R", e + s * 2 * d)];
    },
  },
  "atr-position": {
    key: "atrsize", group: "risk",
    fields: [F("balance", "5000"), F("riskPct", "1"), F("entry", "100"), F("atr", "1.5"), F("mult", "2")],
    compute: (v) => {
      const b = g(v.balance), r = g(v.riskPct), e = g(v.entry), a = g(v.atr), m = g(v.mult);
      if (!pos(b, r, e, a, m) || r > 100) return null;
      const risk = (b * r) / 100, d = a * m, units = risk / d;
      return [row("riskMoney", risk), row("stopDistance", d), row("units", units), row("notional", units * e)];
    },
  },
  "recovery-wins": {
    key: "recwins", group: "risk",
    fields: [F("drawdownPct", "20"), F("riskPct", "1"), F("rr", "2")],
    compute: (v) => {
      const dd = g(v.drawdownPct), r = g(v.riskPct), rr = g(v.rr);
      if (!pos(dd, r, rr) || dd >= 100 || r > 100) return null;
      const gain = (r * rr) / 100;
      const need = 1 / (1 - dd / 100);
      return [row("neededGain", (need - 1) * 100, "pct"), row("gainPerWin", gain * 100, "pct"), row("winsNeeded", Math.ceil(Math.log(need) / Math.log(1 + gain) - 1e-12), "int")];
    },
  },

  // ---------- Форекс ----------
  "pip-value": {
    key: "pipvalue", group: "forex",
    fields: [F("lots", "1"), F("contract", "100000"), F("pipSize", "0.0001"), F("quoteToUsd", "1")],
    compute: (v) => {
      const l = g(v.lots), c = g(v.contract), p = g(v.pipSize), q = g(v.quoteToUsd);
      if (!pos(l, c, p, q)) return null;
      const pv = l * c * p * q;
      return [row("perPip", pv), row("per10", pv * 10), row("per100", pv * 100)];
    },
  },
  "swap-cost": {
    key: "swapcost", group: "forex",
    fields: [F("lots", "1"), F("swapPerLot", "-6.5"), F("nights", "10"), F("tripleDays", "1")],
    compute: (v) => {
      const l = g(v.lots), s = g(v.swapPerLot), n = g(v.nights), t = g(v.tripleDays);
      if (!pos(l, n) || !fin(s) || !nn(t)) return null;
      const total = l * s * (n + 2 * t);
      return [row("total", total, "num", tone(total)), row("perNight", l * s, "num", tone(l * s)), row("per30", l * s * 30, "num", tone(l * s))];
    },
  },
  "spread-cost": {
    key: "spreadcost", group: "forex",
    fields: [F("price", "1.1"), F("spread", "0.0002"), F("units", "100000"), F("commission", "7")],
    compute: (v) => {
      const p = g(v.price), s = g(v.spread), u = g(v.units), c = g(v.commission);
      if (!pos(p, u) || !nn(s, c)) return null;
      const spreadMoney = s * u, total = spreadMoney + c;
      return [row("spreadPct", (s / p) * 100, "pct"), row("spreadMoney", spreadMoney), row("totalCost", total), row("costPct", (total / (p * u)) * 100, "pct")];
    },
  },
  "currency-convert": {
    key: "fxconvert", group: "forex",
    fields: [F("amount", "1000"), F("rate", "12500"), F("feePct", "0.5")],
    compute: (v) => {
      const a = g(v.amount), r = g(v.rate), f = g(v.feePct);
      if (!pos(a, r) || !nn(f) || f >= 100) return null;
      const gross = a * r, fee = (gross * f) / 100;
      return [row("received", gross - fee), row("feeAmount", fee), row("effectiveRate", (gross - fee) / a)];
    },
  },
  "cross-rate": {
    key: "crossrate", group: "forex",
    fields: [F("mode", "1", { choices: [1, 2] }), F("a", "1.08"), F("b", "150")],
    compute: (v) => {
      const m = g(v.mode), a = g(v.a), b = g(v.b);
      if (!pos(a, b)) return null;
      const cross = m === 2 ? a / b : a * b;
      return [row("cross", cross), row("inverse", 1 / cross)];
    },
  },
  "pips-profit": {
    key: "pipsprofit", group: "forex",
    fields: [SIDE, F("entry", "1.085"), F("exit", "1.0925"), F("pipSize", "0.0001"), F("lots", "0.5"), F("pipValue", "10")],
    compute: (v) => {
      const s = sign(g(v.side)), e = g(v.entry), x = g(v.exit), ps = g(v.pipSize), l = g(v.lots), pv = g(v.pipValue);
      if (!pos(e, x, ps, l, pv)) return null;
      const pips = ((x - e) / ps) * s;
      return [row("pips", pips, "num", tone(pips)), row("profit", pips * pv * l, "num", tone(pips))];
    },
  },
  "margin-level": {
    key: "marginlevel", group: "forex",
    fields: [F("equity", "5000"), F("usedMargin", "2000"), F("callLevel", "100"), F("stopOutLevel", "50")],
    compute: (v) => {
      const e = g(v.equity), u = g(v.usedMargin), c = g(v.callLevel), so = g(v.stopOutLevel);
      if (!pos(e, u, c, so)) return null;
      return [row("level", (e / u) * 100, "pct"), row("freeMargin", e - u), row("lossToCall", e - (u * c) / 100), row("lossToStopOut", e - (u * so) / 100)];
    },
  },
  "lot-converter": {
    key: "lotconv", group: "forex",
    fields: [F("lots", "0.25"), F("contract", "100000")],
    compute: (v) => {
      const l = g(v.lots), c = g(v.contract);
      if (!pos(l, c)) return null;
      return [row("units", l * c), row("miniLots", l * 10), row("microLots", l * 100)];
    },
  },

  // ---------- Акции ----------
  "dividend-yield": {
    key: "divyield", group: "stocks",
    fields: [F("price", "60"), F("dividend", "2.4"), F("shares", "100"), F("buyPrice", "45")],
    compute: (v) => {
      const p = g(v.price), d = g(v.dividend), s = g(v.shares), b = g(v.buyPrice);
      if (!pos(p, s, b) || !nn(d)) return null;
      return [row("yield", (d / p) * 100, "pct"), row("yieldOnCost", (d / b) * 100, "pct"), row("incomeYear", d * s), row("incomeMonth", (d * s) / 12)];
    },
  },
  "pe-valuation": {
    key: "pe", group: "stocks",
    fields: [F("price", "150"), F("eps", "6"), F("growth", "10")],
    compute: (v) => {
      const p = g(v.price), e = g(v.eps), gr = g(v.growth);
      if (!pos(p, e, gr)) return null;
      const pe = p / e;
      return [row("pe", pe), row("earningsYield", (e / p) * 100, "pct"), row("peg", pe / gr)];
    },
  },
  "stock-split": {
    key: "split", group: "stocks",
    fields: [F("shares", "10"), F("price", "800"), F("newPer", "4"), F("oldPer", "1")],
    compute: (v) => {
      const s = g(v.shares), p = g(v.price), n = g(v.newPer), o = g(v.oldPer);
      if (!pos(s, p, n, o)) return null;
      const ratio = n / o;
      return [row("ratio", ratio), row("newShares", s * ratio), row("newPrice", p / ratio), row("value", s * p)];
    },
  },
  "stock-net-profit": {
    key: "stocknet", group: "stocks",
    fields: [F("buy", "100"), F("sell", "120"), F("shares", "50"), F("commissionPct", "0.1"), F("taxPct", "10")],
    compute: (v) => {
      const b = g(v.buy), s = g(v.sell), q = g(v.shares), c = g(v.commissionPct), t = g(v.taxPct);
      if (!pos(b, s, q) || !nn(c, t) || t > 100) return null;
      const gross = (s - b) * q, commission = ((b + s) * q * c) / 100, before = gross - commission;
      const tax = Math.max(0, before) * (t / 100), net = before - tax;
      return [row("gross", gross, "num", tone(gross)), row("commission", commission), row("tax", tax), row("net", net, "num", tone(net)), row("netPct", (net / (b * q)) * 100, "pct", tone(net))];
    },
  },
  "stock-breakeven": {
    key: "stockbe", group: "stocks",
    fields: [F("buy", "100"), F("shares", "50"), F("commissionPct", "0.1")],
    compute: (v) => {
      const b = g(v.buy), q = g(v.shares), c = g(v.commissionPct) / 100;
      if (!pos(b, q) || !nn(c) || c >= 1) return null;
      const be = (b * (1 + c)) / (1 - c);
      return [row("breakeven", be), row("movePct", (be / b - 1) * 100, "pct"), row("roundTrip", (b + be) * q * c)];
    },
  },
  "periodic-invest": {
    key: "periodic", group: "stocks",
    fields: [F("monthly", "200"), F("annualReturn", "8"), F("years", "10")],
    compute: (v) => {
      const m = g(v.monthly), r = g(v.annualReturn), y = g(v.years);
      if (!pos(m, y) || !fin(r) || r <= -100 || y > 100) return null;
      const n = Math.round(y * 12), i = r / 1200;
      const fv = i === 0 ? m * n : (m * (Math.pow(1 + i, n) - 1)) / i;
      return [row("invested", m * n), row("futureValue", fv), row("gain", fv - m * n, "num", tone(fv - m * n))];
    },
  },
  cagr: {
    key: "cagr", group: "stocks",
    fields: [F("start", "10000"), F("end", "18000"), F("years", "5")],
    compute: (v) => {
      const s = g(v.start), e = g(v.end), y = g(v.years);
      if (!pos(s, e, y)) return null;
      const c = (Math.pow(e / s, 1 / y) - 1) * 100;
      return [row("cagr", c, "pct", tone(c)), row("totalReturn", (e / s - 1) * 100, "pct", tone(c))];
    },
  },
  "total-return": {
    key: "totalret", group: "stocks",
    fields: [F("start", "10000"), F("end", "11500"), F("dividends", "400")],
    compute: (v) => {
      const s = g(v.start), e = g(v.end), d = g(v.dividends);
      if (!pos(s, e) || !nn(d)) return null;
      const total = ((e + d - s) / s) * 100;
      return [row("total", total, "pct", tone(total)), row("priceReturn", ((e - s) / s) * 100, "pct"), row("dividendReturn", (d / s) * 100, "pct")];
    },
  },

  // ---------- Опционы и фьючерсы ----------
  "option-breakeven": {
    key: "optbe", group: "derivs",
    fields: [F("type", "1", { choices: [1, 2] }), F("strike", "100"), F("premium", "3"), F("contracts", "2"), F("mult", "100"), F("target", "108")],
    compute: (v) => {
      const call = g(v.type) !== 2, k = g(v.strike), p = g(v.premium), c = g(v.contracts), m = g(v.mult), t = g(v.target);
      if (!pos(k, p, c, m) || !nn(t)) return null;
      const payoff = call ? Math.max(0, t - k) : Math.max(0, k - t);
      const profit = (payoff - p) * m * c, maxLoss = p * m * c;
      return [row("breakeven", call ? k + p : k - p), row("maxLoss", maxLoss), row("profitAtTarget", profit, "num", tone(profit)), row("roi", (profit / maxLoss) * 100, "pct", tone(profit))];
    },
  },
  "covered-call": {
    key: "covcall", group: "derivs",
    fields: [F("stockPrice", "50"), F("strike", "55"), F("premium", "1.2"), F("shares", "100")],
    compute: (v) => {
      const sp = g(v.stockPrice), k = g(v.strike), p = g(v.premium), q = g(v.shares);
      if (!pos(sp, k, q) || !nn(p)) return null;
      const maxProfit = (k - sp + p) * q;
      return [row("maxProfit", maxProfit, "num", tone(maxProfit)), row("breakeven", sp - p), row("protection", (p / sp) * 100, "pct"), row("returnIfCalled", (maxProfit / (sp * q)) * 100, "pct", tone(maxProfit))];
    },
  },
  "futures-pnl": {
    key: "futpnl", group: "derivs",
    fields: [SIDE, F("entry", "20000"), F("exit", "20050"), F("tickSize", "0.25"), F("tickValue", "5"), F("contracts", "2")],
    compute: (v) => {
      const s = sign(g(v.side)), e = g(v.entry), x = g(v.exit), ts = g(v.tickSize), tv = g(v.tickValue), c = g(v.contracts);
      if (!pos(e, x, ts, tv, c)) return null;
      const ticks = ((x - e) / ts) * s;
      return [row("ticks", ticks, "num", tone(ticks)), row("perContract", ticks * tv, "num", tone(ticks)), row("pnl", ticks * tv * c, "num", tone(ticks))];
    },
  },
  "futures-leverage": {
    key: "futlev", group: "derivs",
    fields: [F("price", "20000"), F("multiplier", "2"), F("marginPerContract", "2000"), F("contracts", "3"), F("balance", "15000")],
    compute: (v) => {
      const p = g(v.price), m = g(v.multiplier), mg = g(v.marginPerContract), c = g(v.contracts), b = g(v.balance);
      if (!pos(p, m, mg, c, b)) return null;
      const notional = p * m * c, margin = mg * c;
      return [row("notional", notional), row("marginTotal", margin), row("contractLeverage", notional / margin), row("accountLeverage", notional / b), row("marginPct", (margin / b) * 100, "pct")];
    },
  },
  "option-time-value": {
    key: "opttv", group: "derivs",
    fields: [F("type", "1", { choices: [1, 2] }), F("spot", "105"), F("strike", "100"), F("premium", "8.5")],
    compute: (v) => {
      const call = g(v.type) !== 2, s = g(v.spot), k = g(v.strike), p = g(v.premium);
      if (!pos(s, k, p)) return null;
      const intrinsic = call ? Math.max(0, s - k) : Math.max(0, k - s);
      const tv = p - intrinsic;
      return [row("intrinsic", intrinsic), row("timeValue", tv, "num", tv < 0 ? "bad" : undefined), row("timeShare", (tv / p) * 100, "pct")];
    },
  },

  // ---------- Крипто ----------
  "funding-cost": {
    key: "fundcost", group: "crypto",
    fields: [SIDE, F("notional", "10000"), F("ratePct", "0.01"), F("hours", "72")],
    compute: (v) => {
      const s = sign(g(v.side)), n = g(v.notional), r = g(v.ratePct), h = g(v.hours);
      if (!pos(n, h) || !fin(r)) return null;
      const perInterval = (n * r) / 100 * s;
      const total = perInterval * (h / 8);
      return [row("perInterval", perInterval, "num", perInterval > 0 ? "bad" : perInterval < 0 ? "good" : undefined), row("total", total, "num", total > 0 ? "bad" : total < 0 ? "good" : undefined), row("annualPct", r * 3 * 365, "pct")];
    },
  },
  "amm-slippage": {
    key: "ammslip", group: "crypto",
    fields: [F("poolX", "1000"), F("poolY", "3500000"), F("amountIn", "10"), F("feePct", "0.3")],
    compute: (v) => {
      const x = g(v.poolX), y = g(v.poolY), dx = g(v.amountIn), f = g(v.feePct);
      if (!pos(x, y, dx) || !nn(f) || f >= 100) return null;
      const eff = dx * (1 - f / 100), out = (y * eff) / (x + eff);
      const spot = y / x, exec = out / dx;
      return [row("out", out), row("spotPrice", spot), row("execPrice", exec), row("impact", (1 - exec / spot) * 100, "pct", "bad"), row("feePaid", (dx * f) / 100)];
    },
  },
  "impermanent-loss": {
    key: "impermanent", group: "crypto",
    fields: [F("priceChangePct", "100"), F("deposit", "1000")],
    compute: (v) => {
      const ch = g(v.priceChangePct), d = g(v.deposit);
      if (!fin(ch) || ch <= -100 || !pos(d)) return null;
      const k = 1 + ch / 100;
      const il = ((2 * Math.sqrt(k)) / (1 + k) - 1) * 100;
      const hold = (d * (1 + k)) / 2, lp = d * Math.sqrt(k);
      return [row("il", il, "pct", il < 0 ? "bad" : undefined), row("holdValue", hold), row("lpValue", lp), row("difference", lp - hold, "num", lp - hold < 0 ? "bad" : undefined)];
    },
  },
  "staking-apy": {
    key: "apy", group: "crypto",
    fields: [F("amount", "1000"), F("aprPct", "8"), F("compounds", "365"), F("years", "2")],
    compute: (v) => {
      const a = g(v.amount), r = g(v.aprPct), n = g(v.compounds), y = g(v.years);
      if (!pos(a, n, y) || !nn(r) || !Number.isInteger(n) || y > 100) return null;
      const apy = (Math.pow(1 + r / 100 / n, n) - 1) * 100;
      const final = a * Math.pow(1 + r / 100 / n, n * y);
      return [row("apy", apy, "pct"), row("final", final), row("earned", final - a, "num", tone(final - a))];
    },
  },
  satoshi: {
    key: "sats", group: "crypto",
    fields: [F("btc", "0.015"), F("price", "95000")],
    compute: (v) => {
      const b = g(v.btc), p = g(v.price);
      if (!pos(b, p)) return null;
      return [row("sats", b * 1e8, "int"), row("usd", b * p), row("satsPerDollar", 1e8 / p, "int")];
    },
  },
  "hodl-pnl": {
    key: "hodlpnl", group: "crypto",
    fields: [F("coins", "2"), F("buyPrice", "3000"), F("nowPrice", "3600"), F("feePct", "0.1")],
    compute: (v) => {
      const c = g(v.coins), b = g(v.buyPrice), n = g(v.nowPrice), f = g(v.feePct) / 100;
      if (!pos(c, b, n) || !nn(f) || f >= 1) return null;
      const cost = c * b * (1 + f), value = c * n * (1 - f), pnl = value - cost;
      return [row("cost", cost), row("value", value), row("pnl", pnl, "num", tone(pnl)), row("pnlPct", (pnl / cost) * 100, "pct", tone(pnl)), row("breakeven", (b * (1 + f)) / (1 - f))];
    },
  },

  // ---------- Золото и металлы ----------
  "metal-convert": {
    key: "metalconv", group: "metals",
    fields: [F("value", "31.1035"), F("unit", "1", { choices: [1, 2, 3, 4] })],
    compute: (v) => {
      const x = g(v.value), u = g(v.unit);
      if (!pos(x)) return null;
      const grams = x * (u === 2 ? 1000 : u === 3 ? TROY_OZ_GRAMS : u === 4 ? 11.6638038 : 1);
      return [row("grams", grams), row("kilograms", grams / 1000), row("troyOz", grams / TROY_OZ_GRAMS), row("tola", grams / 11.6638038)];
    },
  },
  "jewelry-markup": {
    key: "jewelmark", group: "metals",
    fields: [F("weight", "10"), F("fineness", "585"), F("spot", "4200"), F("shopPrice", "950")],
    compute: (v) => {
      const w = g(v.weight), f = g(v.fineness), spot = g(v.spot), shop = g(v.shopPrice);
      if (!pos(w, f, spot, shop) || f > 1000) return null;
      const melt = ((w * f) / 1000 / TROY_OZ_GRAMS) * spot, markup = shop - melt;
      return [row("melt", melt), row("markup", markup, "num", markup > 0 ? "bad" : undefined), row("markupPct", (markup / melt) * 100, "pct"), row("perGram", markup / w)];
    },
  },
  "karat-converter": {
    key: "karat", group: "metals",
    fields: [F("karat", "18")],
    compute: (v) => {
      const k = g(v.karat);
      if (!pos(k) || k > 24) return null;
      return [row("fineness", (k / 24) * 1000), row("goldPct", (k / 24) * 100, "pct"), row("otherPct", (1 - k / 24) * 100, "pct")];
    },
  },
  "etf-gold-per-share": {
    key: "etfgold", group: "metals",
    fields: [F("sharePrice", "42"), F("ouncesPerShare", "0.0100"), F("spot", "4200"), F("shares", "10")],
    compute: (v) => {
      const p = g(v.sharePrice), o = g(v.ouncesPerShare), s = g(v.spot), q = g(v.shares);
      if (!pos(p, o, s, q)) return null;
      const nav = o * s;
      return [row("nav", nav), row("premium", (p / nav - 1) * 100, "pct"), row("gramsPerShare", o * TROY_OZ_GRAMS), row("goldGrams", o * TROY_OZ_GRAMS * q)];
    },
  },

  // ---------- Финансы ----------
  rebalance: {
    key: "rebalance", group: "finance",
    fields: [F("valueA", "7000"), F("valueB", "3000"), F("targetA", "60")],
    compute: (v) => {
      const a = g(v.valueA), b = g(v.valueB), t = g(v.targetA);
      if (!nn(a, b) || !(a + b > 0) || !fin(t) || t < 0 || t > 100) return null;
      const total = a + b, targetA = (total * t) / 100, diff = targetA - a;
      return [row("currentA", (a / total) * 100, "pct"), row("targetAmountA", targetA), row("tradeA", diff), row("tradeB", -diff)];
    },
  },
  "inflation-real-return": {
    key: "realreturn", group: "finance",
    fields: [F("nominal", "12"), F("inflation", "8"), F("years", "5"), F("amount", "10000")],
    compute: (v) => {
      const n = g(v.nominal), i = g(v.inflation), y = g(v.years), a = g(v.amount);
      if (!fin(n, i) || n <= -100 || i <= -100 || !pos(y, a) || y > 100) return null;
      const nominalFuture = a * Math.pow(1 + n / 100, y);
      const real = ((1 + n / 100) / (1 + i / 100) - 1) * 100;
      return [row("real", real, "pct", tone(real)), row("futureNominal", nominalFuture), row("futureReal", nominalFuture / Math.pow(1 + i / 100, y), "num", tone(real))];
    },
  },
  "loan-payment": {
    key: "loan", group: "finance",
    fields: [F("amount", "10000"), F("aprPct", "18"), F("months", "24")],
    compute: (v) => {
      const p = g(v.amount), r = g(v.aprPct), m = g(v.months);
      if (!pos(p, m) || !nn(r) || !Number.isInteger(m) || m > 600) return null;
      const i = r / 1200;
      const pay = i === 0 ? p / m : (p * i) / (1 - Math.pow(1 + i, -m));
      return [row("payment", pay), row("total", pay * m), row("interest", pay * m - p, "num", "bad")];
    },
  },
  "savings-goal": {
    key: "savegoal", group: "finance",
    fields: [F("target", "50000"), F("years", "8"), F("annualReturn", "7"), F("initial", "2000")],
    compute: (v) => {
      const t = g(v.target), y = g(v.years), r = g(v.annualReturn), s = g(v.initial);
      if (!pos(t, y) || !fin(r) || r <= -100 || !nn(s) || y > 100) return null;
      const n = Math.round(y * 12), i = r / 1200;
      if (n < 1) return null;
      const grown = s * Math.pow(1 + i, n);
      const need = Math.max(0, t - grown);
      const monthly = i === 0 ? Math.max(0, t - s) / n : (need * i) / (Math.pow(1 + i, n) - 1);
      return [row("monthly", monthly), row("totalPaid", monthly * n + s), row("growth", t - (monthly * n + s), "num", tone(t - (monthly * n + s)))];
    },
  },
  "rule-of-72": {
    key: "rule72", group: "finance",
    fields: [F("ratePct", "9")],
    compute: (v) => {
      const r = g(v.ratePct);
      if (!pos(r)) return null;
      return [row("approx", 72 / r), row("exact", Math.log(2) / Math.log(1 + r / 100)), row("triple", Math.log(3) / Math.log(1 + r / 100))];
    },
  },
  "percent-change": {
    key: "pctchange", group: "finance",
    fields: [F("from", "80"), F("to", "100")],
    compute: (v) => {
      const a = g(v.from), b = g(v.to);
      if (!pos(a, b)) return null;
      const ch = ((b - a) / a) * 100;
      return [row("change", ch, "pct", tone(ch)), row("backNeeded", ((a - b) / b) * 100, "pct"), row("ratio", b / a)];
    },
  },

  // ---------- Статистика дисциплины ----------
  "winrate-confidence": {
    key: "wilson", group: "stats",
    fields: [F("wins", "28"), F("trades", "50")],
    compute: (v) => {
      const w = g(v.wins), n = g(v.trades);
      if (!nn(w) || !pos(n) || w > n || !Number.isInteger(w) || !Number.isInteger(n) || n > 1e7) return null;
      const p = w / n, z = 1.959964, z2 = z * z;
      const den = 1 + z2 / n, center = (p + z2 / (2 * n)) / den;
      const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
      return [row("rate", p * 100, "pct"), row("low", Math.max(0, center - half) * 100, "pct"), row("high", Math.min(1, center + half) * 100, "pct"), row("margin", half * 100, "pct")];
    },
  },
  "streak-probability": {
    key: "streakprob", group: "stats",
    fields: [F("trades", "100"), F("winRate", "50"), F("streak", "6")],
    compute: (v) => {
      const n = g(v.trades), w = g(v.winRate) / 100, k = g(v.streak);
      if (!pos(n, k) || !Number.isInteger(n) || !Number.isInteger(k) || n > 5000 || k > 200 || !fin(w) || w < 0 || w > 1) return null;
      const q = 1 - w;
      let dist = new Array<number>(k).fill(0);
      dist[0] = 1;
      let hit = 0;
      for (let t = 0; t < n; t++) {
        const next = new Array<number>(k).fill(0);
        let sum = 0;
        for (let j = 0; j < k; j++) {
          sum += dist[j];
          if (j + 1 < k) next[j + 1] = dist[j] * q;
          else hit += dist[j] * q;
        }
        next[0] = sum * w;
        dist = next;
      }
      return [row("probability", hit * 100, "pct", hit > 0.5 ? "bad" : undefined), row("noStreak", (1 - hit) * 100, "pct")];
    },
  },
  "sharpe-ratio": {
    key: "sharpe", group: "stats",
    fields: [F("mean", "0.12"), F("stdev", "1.1"), F("rf", "0.02"), F("periods", "252", { choices: [252, 52, 12] })],
    compute: (v) => {
      const m = g(v.mean), s = g(v.stdev), rf = g(v.rf), p = g(v.periods);
      if (!fin(m, rf) || !pos(s, p)) return null;
      const sr = (m - rf) / s;
      return [row("perPeriod", sr, "num", tone(sr)), row("annual", sr * Math.sqrt(p), "num", tone(sr))];
    },
  },
};

export const EXTRA_DEFS: Record<string, XDef> = Object.fromEntries(
  Object.entries(DEFS).map(([slug, d]) => [slug, { ...d, compute: (v: V) => guard(d.compute(v)) }]),
);
export const EXTRA_SLUGS = Object.keys(EXTRA_DEFS);
export const EXTRA_DICT_KEY: Record<string, string> = Object.fromEntries(Object.entries(EXTRA_DEFS).map(([slug, d]) => [slug, d.key]));
export const isExtraSlug = (slug: string) => Object.hasOwn(EXTRA_DEFS, slug);
