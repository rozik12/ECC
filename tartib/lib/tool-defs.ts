// Описание публичных калькуляторов: поля, значения по умолчанию и функция расчёта.
import { compound, drawdownRecovery, feeBreakeven, goalPlan, kelly, liquidation, lossStreak, margin, positionSize, riskOfRuin, riskReward, tradeProfit } from "./tools.ts";

export type ToolSlug = "position-size" | "risk-reward" | "loss-streak" | "drawdown-recovery" | "compound" | "kelly" | "risk-of-ruin" | "liquidation" | "fee-breakeven" | "profit" | "goal" | "margin";
export const CALC_SLUGS: ToolSlug[] = ["position-size", "risk-reward", "loss-streak", "drawdown-recovery", "compound", "kelly", "risk-of-ruin", "liquidation", "fee-breakeven", "profit", "goal", "margin"];
export const TOOL_SLUGS = [...CALC_SLUGS, "sessions"] as const;

/** Ключ в словаре tools.<key> для адреса страницы */
export const DICT_KEY: Record<string, "size" | "rr" | "streak" | "recovery" | "compound" | "sessions" | "kelly" | "ruin" | "liq" | "fee" | "profit" | "goal" | "margin"> = {
  "position-size": "size",
  "risk-reward": "rr",
  "loss-streak": "streak",
  "drawdown-recovery": "recovery",
  compound: "compound",
  sessions: "sessions",
  kelly: "kelly",
  "risk-of-ruin": "ruin",
  liquidation: "liq",
  "fee-breakeven": "fee",
  profit: "profit",
  goal: "goal",
  margin: "margin",
};

export type Fmt = "num" | "money" | "pct" | "ratio" | "text";
/** Одна строка результата: ключ подписи в словаре, значение и как его показывать */
export type Row = { key: string; value: number | string; fmt: Fmt; tone?: "good" | "bad" };

/** choices — выбор из списка (например, лонг/шорт): значение числовое, подпись берётся из словаря tools.<тема>.c.<значение> */
export type Field = { id: string; def: string; optional?: boolean; choices?: number[] };
export type ToolDef = { fields: Field[]; compute: (v: Record<string, number | null>) => Row[] | null };

const n = (v: number | null) => v ?? NaN;

export const TOOL_DEFS: Record<ToolSlug, ToolDef> = {
  "position-size": {
    fields: [{ id: "balance", def: "5000" }, { id: "riskPct", def: "1" }, { id: "entry", def: "100" }, { id: "stop", def: "98" }],
    compute: (v) => {
      const r = positionSize({ balance: n(v.balance), riskPct: n(v.riskPct), entry: n(v.entry), stop: n(v.stop) });
      if (!r.ok) return null;
      return [
        { key: "direction", value: r.direction, fmt: "text" },
        { key: "riskAmount", value: r.riskAmount, fmt: "num" },
        { key: "distance", value: r.distance, fmt: "num" },
        { key: "units", value: r.units, fmt: "num" },
        { key: "value", value: r.value, fmt: "num" },
      ];
    },
  },
  "risk-reward": {
    fields: [{ id: "entry", def: "100" }, { id: "stop", def: "98" }, { id: "target", def: "104" }, { id: "winRate", def: "40", optional: true }],
    compute: (v) => {
      const r = riskReward({ entry: n(v.entry), stop: n(v.stop), target: n(v.target), winRate: v.winRate });
      if (!r.ok) return null;
      const rows: Row[] = [
        { key: "direction", value: r.direction, fmt: "text" },
        { key: "risk", value: r.risk, fmt: "num" },
        { key: "reward", value: r.reward, fmt: "num" },
        { key: "rr", value: r.rr, fmt: "ratio" },
        { key: "breakEven", value: r.breakEvenWinRate, fmt: "pct" },
      ];
      if (r.expectancyR !== null) rows.push({ key: "expectancy", value: r.expectancyR, fmt: "num", tone: r.expectancyR >= 0 ? "good" : "bad" });
      return rows;
    },
  },
  "loss-streak": {
    fields: [{ id: "winRate", def: "45" }, { id: "trades", def: "100" }, { id: "streak", def: "5" }, { id: "riskPct", def: "1" }],
    compute: (v) => {
      const r = lossStreak({ winRate: n(v.winRate), trades: n(v.trades), streak: n(v.streak), riskPct: n(v.riskPct) });
      if (!r.ok) return null;
      return [
        { key: "single", value: r.single * 100, fmt: "pct" },
        { key: "atLeast", value: r.atLeastOnce * 100, fmt: "pct" },
        { key: "drawdown", value: r.drawdownPct, fmt: "pct" },
        { key: "recovery", value: r.recoveryPct, fmt: "pct" },
      ];
    },
  },
  "drawdown-recovery": {
    fields: [{ id: "drawdown", def: "20" }],
    compute: (v) => {
      const need = drawdownRecovery(n(v.drawdown));
      if (need === null) return null;
      return [
        { key: "needed", value: need, fmt: "pct" },
        { key: "mult", value: 1 / (1 - n(v.drawdown) / 100), fmt: "num" },
      ];
    },
  },
  compound: {
    fields: [{ id: "start", def: "1000" }, { id: "monthlyPct", def: "5" }, { id: "months", def: "12" }, { id: "deposit", def: "100" }],
    compute: (v) => {
      const r = compound({ start: n(v.start), monthlyPct: n(v.monthlyPct), months: n(v.months), monthlyDeposit: n(v.deposit) });
      if (!r.ok) return null;
      return [
        { key: "final", value: r.final, fmt: "num" },
        { key: "deposited", value: r.deposited, fmt: "num" },
        { key: "gain", value: r.gain, fmt: "num", tone: r.gain >= 0 ? "good" : "bad" },
      ];
    },
  },
  kelly: {
    fields: [{ id: "winRate", def: "45" }, { id: "rr", def: "2" }],
    compute: (v) => {
      const r = kelly({ winRate: n(v.winRate), rr: n(v.rr) });
      if (!r.ok) return null;
      return [
        { key: "edge", value: r.edge, fmt: "num", tone: r.edge > 0 ? "good" : "bad" },
        { key: "full", value: r.kellyPct, fmt: "pct" },
        { key: "half", value: r.halfPct, fmt: "pct" },
        { key: "quarter", value: r.quarterPct, fmt: "pct" },
      ];
    },
  },
  "risk-of-ruin": {
    fields: [{ id: "winRate", def: "45" }, { id: "rr", def: "2" }, { id: "riskPct", def: "1" }, { id: "ruinDrawdown", def: "50" }],
    compute: (v) => {
      const r = riskOfRuin({ winRate: n(v.winRate), rr: n(v.rr), riskPct: n(v.riskPct), ruinDrawdown: n(v.ruinDrawdown) });
      if (!r.ok) return null;
      return [
        { key: "expectancy", value: r.expectancyR, fmt: "num", tone: r.expectancyR > 0 ? "good" : "bad" },
        { key: "cushion", value: r.cushionR, fmt: "num" },
        { key: "ruin", value: r.ruinPct, fmt: "pct", tone: r.ruinPct < 5 ? "good" : r.ruinPct > 30 ? "bad" : undefined },
      ];
    },
  },
  liquidation: {
    fields: [{ id: "entry", def: "100" }, { id: "size", def: "1" }, { id: "leverage", def: "10" }, { id: "maintenance", def: "0.5" }, { id: "side", def: "1", choices: [1, 2] }],
    compute: (v) => {
      const r = liquidation({ entry: n(v.entry), size: n(v.size), leverage: n(v.leverage), maintenancePct: n(v.maintenance), direction: v.side === 2 ? "short" : "long" });
      if (!r.ok) return null;
      return [
        { key: "direction", value: r.direction, fmt: "text" },
        { key: "price", value: r.price, fmt: "num", tone: "bad" },
        { key: "distance", value: r.distancePct, fmt: "pct" },
        { key: "margin", value: r.margin, fmt: "num" },
      ];
    },
  },
  "fee-breakeven": {
    fields: [{ id: "entry", def: "100" }, { id: "feePct", def: "0.05" }, { id: "side", def: "1", choices: [1, 2] }],
    compute: (v) => {
      const r = feeBreakeven({ entry: n(v.entry), feePct: n(v.feePct), direction: v.side === 2 ? "short" : "long" });
      if (!r.ok) return null;
      return [
        { key: "price", value: r.price, fmt: "num" },
        { key: "move", value: r.movePct, fmt: "pct" },
        { key: "total", value: r.feeTotalPct, fmt: "pct" },
      ];
    },
  },
  profit: {
    fields: [{ id: "entry", def: "100" }, { id: "exit", def: "105" }, { id: "size", def: "10" }, { id: "feePct", def: "0.05" }, { id: "balance", def: "5000", optional: true }, { id: "side", def: "1", choices: [1, 2] }],
    compute: (v) => {
      const r = tradeProfit({ entry: n(v.entry), exit: n(v.exit), size: n(v.size), feePct: n(v.feePct), balance: v.balance, direction: v.side === 2 ? "short" : "long" });
      if (!r.ok) return null;
      const rows: Row[] = [
        { key: "gross", value: r.gross, fmt: "num", tone: r.gross >= 0 ? "good" : "bad" },
        { key: "fees", value: r.fees, fmt: "num" },
        { key: "net", value: r.net, fmt: "num", tone: r.net >= 0 ? "good" : "bad" },
        { key: "pctPosition", value: r.pctOfPosition, fmt: "pct" },
      ];
      if (r.pctOfBalance !== null) rows.push({ key: "pctBalance", value: r.pctOfBalance, fmt: "pct" });
      return rows;
    },
  },
  goal: {
    fields: [{ id: "start", def: "1000" }, { id: "target", def: "5000" }, { id: "monthlyPct", def: "5" }, { id: "deposit", def: "0" }],
    compute: (v) => {
      const r = goalPlan({ start: n(v.start), target: n(v.target), monthlyPct: n(v.monthlyPct), monthlyDeposit: n(v.deposit) });
      if (!r.ok) return null;
      return [
        { key: "months", value: r.months, fmt: "num" },
        { key: "years", value: r.years, fmt: "num" },
        { key: "deposited", value: r.deposited, fmt: "num" },
      ];
    },
  },
  margin: {
    fields: [{ id: "positionValue", def: "10000" }, { id: "leverage", def: "10" }, { id: "balance", def: "5000", optional: true }],
    compute: (v) => {
      const r = margin({ positionValue: n(v.positionValue), leverage: n(v.leverage), balance: v.balance });
      if (!r.ok) return null;
      const rows: Row[] = [{ key: "margin", value: r.margin, fmt: "num" }];
      if (r.marginPctOfBalance !== null) rows.push({ key: "pctBalance", value: r.marginPctOfBalance, fmt: "pct" });
      if (r.maxPosition !== null) rows.push({ key: "maxPosition", value: r.maxPosition, fmt: "num" });
      return rows;
    },
  },
};
