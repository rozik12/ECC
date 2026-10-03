"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { importTradesAction, type ImportRowResult } from "@/app/actions/import";
import { Alert, Button, Card, Select } from "@/components/ui";
import { parseCsv } from "@/lib/csv";
import { mapCsvRows, MAX_IMPORT_ROWS, TRADE_COLUMNS } from "@/lib/import";
import { useI18n } from "@/lib/i18n/provider";

type Account = { id: string; name: string };

export function ImportTrades({ accounts }: { accounts: Account[] }) {
  const { t } = useI18n();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<string[][] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<ImportRowResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mapped = useMemo(() => (rows ? mapCsvRows(rows) : null), [rows]);
  const valid = mapped?.items.filter((i) => i.payload) ?? [];
  const invalid = mapped?.items.filter((i) => !i.payload) ?? [];
  const tooMany = rows !== null && rows.length - 1 > MAX_IMPORT_ROWS;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setResults(null);
    setError(null);
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return setError("import.tooBig");
    setFileName(file.name);
    setRows(parseCsv(await file.text()));
  }

  async function run() {
    setError(null);
    setResults(null);
    const all: ImportRowResult[] = [];
    setProgress({ done: 0, total: valid.length });
    for (let i = 0; i < valid.length; i += 25) {
      const chunk = valid.slice(i, i + 25).map((v) => ({ line: v.line, payload: v.payload as Record<string, unknown>, violatedRuleNames: v.violatedRuleNames }));
      const res = await importTradesAction(accountId, chunk);
      if (!res.ok) {
        setError(res.error);
        break;
      }
      all.push(...res.results);
      setProgress({ done: Math.min(i + 25, valid.length), total: valid.length });
      if (res.results.some((r) => r.error === "errors.limitTrades")) break;
    }
    setResults([...all, ...invalid.map((i) => ({ line: i.line, ok: false, error: i.error ?? "import.errValues" }))]);
    setProgress(null);
  }

  const imported = results?.filter((r) => r.ok).length ?? 0;
  const failed = results?.filter((r) => !r.ok) ?? [];

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <p className="text-sm text-muted">{t("import.intro")}</p>
        <p className="text-sm">
          <span className="font-medium">{t("import.columns")}:</span>{" "}
          <code className="text-xs text-muted">{TRADE_COLUMNS.join(", ")}</code>
        </p>
        <p className="text-sm text-muted">{t("import.required")}</p>
        <a href="/api/trades/export?template=1" className="inline-block text-sm font-medium text-primary hover:underline">{t("import.template")}</a>

        {accounts.length > 1 && (
          <Select id="imp-account" label={t("trades.form.account")} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        )}
        <div>
          <label htmlFor="imp-file" className="mb-1.5 block text-sm font-medium">{t("import.file")}</label>
          <input id="imp-file" type="file" accept=".csv,text/csv,text/plain" onChange={onFile} className="block w-full text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-primary-soft file:px-4 file:py-2.5 file:font-medium file:text-primary" />
        </div>
      </Card>

      {error && <Alert tone="danger">{t(error)}</Alert>}
      {mapped && mapped.missing.length > 0 && <Alert tone="danger">{t("import.missing", { cols: mapped.missing.join(", ") })}</Alert>}
      {tooMany && <Alert tone="warning">{t("import.limitRows", { n: MAX_IMPORT_ROWS })}</Alert>}

      {mapped && mapped.missing.length === 0 && !results && (
        <Card className="space-y-3">
          <p className="font-medium">{fileName}</p>
          <p className="text-sm">{t("import.summary", { valid: valid.length, invalid: invalid.length })}</p>
          {invalid.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-warning">
              {invalid.slice(0, 5).map((i) => <li key={i.line}>{t("import.lineError", { line: i.line, reason: t(i.error ?? "import.errValues") })}</li>)}
              {invalid.length > 5 && <li>{t("import.more", { n: invalid.length - 5 })}</li>}
            </ul>
          )}
          <Button size="lg" disabled={valid.length === 0 || progress !== null || !accountId} onClick={run}>
            {progress ? t("import.progress", progress) : t("import.run", { n: valid.length })}
          </Button>
        </Card>
      )}

      {results && (
        <Card className="space-y-3">
          <p className="font-semibold">{t("import.done", { n: imported })}</p>
          {failed.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-warning">
              {failed.slice(0, 8).map((f) => <li key={f.line}>{t("import.lineError", { line: f.line, reason: t(f.error ?? "import.errValues") })}</li>)}
              {failed.length > 8 && <li>{t("import.more", { n: failed.length - 8 })}</li>}
            </ul>
          )}
          <Link href="/trades" className="inline-block text-sm font-medium text-primary hover:underline">{t("trades.detail.back")} →</Link>
        </Card>
      )}
    </div>
  );
}
