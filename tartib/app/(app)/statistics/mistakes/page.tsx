import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MistakeEditor } from "@/components/statistics/MistakeEditor";
import { Badge, buttonStyles, Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { getAccounts } from "@/lib/data";
import { formatDateTime, formatMoney, formatNumber, pnlTone } from "@/lib/format";
import { getTranslator } from "@/lib/i18n/server";
import { MISTAKES } from "@/lib/journal";
import { safeTimeZone } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("mistakes.title") };
}

type Row = {
  id: string;
  traded_at: string;
  instrument: string;
  pnl: number;
  mistakes: string[] | null;
  mistake_note: string | null;
  screenshot_path: string | null;
  rules_followed: boolean;
  trade_rule_violations: { rule: { name: string } | { name: string }[] | null }[];
};

const PAGE = 30;
const COLS = "id, traded_at, instrument, pnl, mistakes, mistake_note, screenshot_path, rules_followed, trade_rule_violations(rule:rules(name))";

/** Ошибки трейдера: что и сколько стоило, из-за чего случилось и снимок экрана. Сделки с нарушенными правилами попадают сюда сами. */
export default async function MistakesPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const sp = await searchParams;
  const { t, locale } = await getTranslator();
  const { supabase, profile } = await requireUser();
  const tz = safeTimeZone(profile?.timezone);
  const accounts = await getAccounts(supabase);
  const currency = accounts[0]?.currency ?? profile?.currency ?? "USD";
  const money = (v: number, signed = false) => formatMoney(v, currency, locale, signed);

  const limit = sp.all === "1" ? 200 : PAGE;
  const [flagged, unreviewed] = await Promise.all([
    supabase.from("trades").select(COLS).or("mistakes.neq.{},mistake_note.neq.,rules_followed.eq.false").order("traded_at", { ascending: false }).limit(limit),
    supabase.from("trades").select(COLS).lt("pnl", 0).eq("mistakes", "{}").eq("mistake_note", "").eq("rules_followed", true).order("traded_at", { ascending: false }).limit(5),
  ]);
  const rows = (flagged.data ?? []) as unknown as Row[];
  const todo = (unreviewed.data ?? []) as unknown as Row[];

  const paths = [...rows, ...todo].map((r) => r.screenshot_path).filter((p): p is string => !!p);
  const signed = paths.length ? await supabase.storage.from("trade-screenshots").createSignedUrls(paths, 3600) : { data: [] };
  const urlOf = new Map((signed.data ?? []).map((x) => [x.path ?? "", x.signedUrl]));

  // Итоги по категориям считаем по всем сделкам с отметкой, а не только по показанным
  const { data: marked } = await supabase.from("trades").select("pnl, mistakes").neq("mistakes", "{}");
  const byKey = new Map<string, { count: number; pnl: number }>();
  for (const r of marked ?? []) for (const k of new Set((r.mistakes as string[]) ?? [])) {
    const cur = byKey.get(k) ?? { count: 0, pnl: 0 };
    byKey.set(k, { count: cur.count + 1, pnl: cur.pnl + Number(r.pnl) });
  }
  const cats = [...byKey.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => a.pnl - b.pnl);
  const markedTotal = (marked ?? []).reduce((s, r) => s + Number(r.pnl), 0);
  const worst = cats[0];

  const violated = (r: Row) => r.trade_rule_violations.flatMap((v) => (Array.isArray(v.rule) ? v.rule : v.rule ? [v.rule] : []).map((x) => x.name));

  const entry = (r: Row) => (
    <Card key={r.id} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/trades/${r.id}`} className="font-semibold hover:underline">{r.instrument}</Link>
        <span className={cn("font-bold tabular-nums", pnlTone(Number(r.pnl)))}>{money(Number(r.pnl), true)}</span>
      </div>
      <p className="text-xs text-muted">{formatDateTime(r.traded_at, locale, tz)}</p>
      {violated(r).length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">{t("mistakes.brokenRules")}:</span>
          {violated(r).map((n) => <Badge key={n} tone="danger">{n}</Badge>)}
        </p>
      )}
      <MistakeEditor tradeId={r.id} mistakes={(r.mistakes ?? []).filter((m) => (MISTAKES as readonly string[]).includes(m))} note={r.mistake_note ?? ""} url={r.screenshot_path ? (urlOf.get(r.screenshot_path) ?? null) : null} />
    </Card>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/statistics" className={buttonStyles({ variant: "ghost", size: "sm", className: "-ml-3" })}>
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t("stats.title")}
      </Link>
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{t("mistakes.title")}</h1>
        <p className="mt-1 text-muted">{t("mistakes.subtitle")}</p>
      </div>

      {cats.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4 sm:p-4">
              <p className="text-sm text-muted">{t("mistakes.marked")}</p>
              <p className="mt-1 text-xl font-bold">{(marked ?? []).length}</p>
            </Card>
            <Card className="p-4 sm:p-4">
              <p className="text-sm text-muted">{t("mistakes.result")}</p>
              <p className={cn("mt-1 text-xl font-bold", pnlTone(markedTotal))}>{money(markedTotal, true)}</p>
            </Card>
          </div>
          {worst && worst.pnl < 0 && (
            <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm">{t("mistakes.worst", { name: t(`journal.mistakeNames.${worst.key}`), n: worst.count, amount: money(worst.pnl, true) })}</p>
          )}
          <Card className="space-y-2">
            <h2 className="font-semibold">{t("mistakes.byKind")}</h2>
            <ul className="divide-y divide-border text-sm">
              {cats.map((c) => (
                <li key={c.key} className="flex items-center justify-between gap-3 py-2.5">
                  <span>{t(`journal.mistakeNames.${c.key}`)} <span className="text-muted">× {formatNumber(c.count, locale, 0)}</span></span>
                  <span className={cn("font-semibold tabular-nums", pnlTone(c.pnl))}>{money(c.pnl, true)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <section className="space-y-3" aria-labelledby="log-title">
        <h2 id="log-title" className="text-lg font-semibold">{t("mistakes.log")}</h2>
        {rows.length === 0 ? (
          <Card><p className="text-sm text-muted">{t("mistakes.empty")}</p></Card>
        ) : (
          rows.map(entry)
        )}
        {rows.length >= limit && sp.all !== "1" && (
          <Link href="/statistics/mistakes?all=1" className={buttonStyles({ variant: "secondary" })}>{t("mistakes.more")}</Link>
        )}
      </section>

      {todo.length > 0 && (
        <section className="space-y-3" aria-labelledby="todo-title">
          <div>
            <h2 id="todo-title" className="text-lg font-semibold">{t("mistakes.todo")}</h2>
            <p className="text-sm text-muted">{t("mistakes.todoHint")}</p>
          </div>
          {todo.map(entry)}
        </section>
      )}
      <p className="text-xs text-muted">{t("common.disclaimer")}</p>
    </div>
  );
}
