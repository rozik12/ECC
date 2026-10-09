// Описание публичных калькуляторов: поля, значения по умолчанию и функция расчёта.
import { compound, drawdownRecovery, lossStreak, positionSize, riskReward } from "@/lib/tools";

export type ToolSlug = "position-size" | "risk-reward" | "loss-streak" | "drawdown-recovery" | "compound";
export const CALC_SLUGS: ToolSlug[] = ["position-size", "risk-reward", "loss-streak", "drawdown-recovery", "compound"];
export const TOOL_SLUGS = [...CALC_SLUGS, "sessions"] as const;

/** Ключ в словаре tools.<key> для адреса страницы */
export const DICT_KEY: Record<string, "size" | "rr" | "streak" | "recovery" | "compound" | "sessions"> = {
  "position-size": "size",
  "risk-reward": "rr",
  "loss-streak": "streak",
  "drawdown-recovery": "recovery",
  compound: "compound",
  sessions: "sessions",
};

export type Fmt = "num" | "money" | "pct" | "ratio" | "text";
/** Одна строка результата: ключ подписи в словаре, значение и как его показывать */
export type Row = { key: string; value: number | string; fmt: Fmt; tone?: "good" | "bad" };

export type Field = { id: string; def: string; optional?: boolean };
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
};
