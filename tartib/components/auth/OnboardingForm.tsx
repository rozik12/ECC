"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { completeOnboardingAction } from "@/app/actions/onboarding";
import { Alert, Button, Input, Select } from "@/components/ui";
import { currencies } from "@/lib/constants";
import { localeLabels, locales } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/provider";
import { onboardingSchema, type OnboardingValues } from "@/lib/validations/onboarding";

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { name: defaultName, language: locale, currency: "USD", accountName: "", startingBalance: undefined },
  });

  async function onSubmit(values: OnboardingValues) {
    setFormError(null);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const result = await completeOnboardingAction({ ...values, timezone });
    if (!result.ok) return setFormError(result.error);
    router.replace("/dashboard");
    router.refresh();
  }

  const err = (e?: { message?: string }) => (e ? t(e.message ?? "errors.generic") : undefined);

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {formError && <Alert tone="danger">{t(formError)}</Alert>}
      <Input id="name" autoComplete="name" label={t("onboarding.name")} error={err(errors.name)} {...register("name")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select id="language" label={t("onboarding.language")} error={err(errors.language)} {...register("language")}>
          {locales.map((l) => <option key={l} value={l}>{localeLabels[l]}</option>)}
        </Select>
        <Select id="currency" label={t("onboarding.currency")} error={err(errors.currency)} {...register("currency")}>
          {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>
      <Input id="accountName" label={t("onboarding.accountName")} placeholder={t("onboarding.accountNamePlaceholder")}
        error={err(errors.accountName)} {...register("accountName")} />
      <Input id="startingBalance" type="number" inputMode="decimal" step="any" label={t("onboarding.startingBalance")}
        hint={t("onboarding.startingBalanceHint")} error={err(errors.startingBalance)}
        {...register("startingBalance", { valueAsNumber: true })} />
      <Button type="submit" size="lg" disabled={isSubmitting}>{t("onboarding.submit")}</Button>
    </form>
  );
}
