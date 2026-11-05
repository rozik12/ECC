"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSettingsAction } from "@/app/actions/settings";
import { Alert, Button, Card, Input, Select } from "@/components/ui";
import { currencies } from "@/lib/constants";
import { localeLabels, locales, type Locale } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/provider";
import { safeTimeZone } from "@/lib/time";

type Props = { language: Locale; currency: string; timezone: string };

export function SettingsForm(initial: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (safeTimeZone(v.timezone) !== v.timezone) return setError("settings.badTimezone");
    startTransition(async () => {
      const result = await updateSettingsAction(v);
      if (!result.ok) return setError(result.error);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <h2 className="font-semibold">{t("settings.general")}</h2>
        {error && <Alert tone="danger">{t(error)}</Alert>}
        {saved && <Alert tone="success">{t("settings.saved")}</Alert>}
        <Select id="s-language" label={t("onboarding.language")} value={v.language} onChange={(e) => setV({ ...v, language: e.target.value as Locale })}>
          {locales.map((l) => <option key={l} value={l}>{localeLabels[l]}</option>)}
        </Select>
        <Select id="s-currency" label={t("onboarding.currency")} value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value })}>
          {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Input id="s-timezone" list="timezones" label={t("settings.timezone")} hint={t("settings.timezoneHint")} value={v.timezone}
          onChange={(e) => setV({ ...v, timezone: e.target.value })} />
        <datalist id="timezones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
        <Button type="submit" disabled={pending}>{t("common.save")}</Button>
      </form>
    </Card>
  );
}
