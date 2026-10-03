"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { requestPasswordResetAction } from "@/app/actions/auth";
import { Alert, Button, Input } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { forgotSchema, type ForgotValues } from "@/lib/validations/auth";

export function ForgotForm() {
  const { t } = useI18n();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema) });

  async function onSubmit(values: ForgotValues) {
    setFormError(null);
    const result = await requestPasswordResetAction(values);
    if (!result.ok) return setFormError(result.error);
    setSent(true);
  }

  if (sent) return <Alert tone="success" title={t("auth.forgot.sentTitle")}>{t("auth.forgot.sentText")}</Alert>;

  return (
    <form method="post" onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {formError && <Alert tone="danger">{t(formError)}</Alert>}
      <Input id="email" type="email" autoComplete="email" label={t("auth.email")}
        error={errors.email && t(errors.email.message ?? "errors.generic")} {...register("email")} />
      <Button type="submit" disabled={isSubmitting} size="lg">{t("auth.forgot.submit")}</Button>
    </form>
  );
}
