"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updatePasswordAction } from "@/app/actions/auth";
import { Alert, Button, Input } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { resetSchema, type ResetValues } from "@/lib/validations/auth";

export function ResetForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({ resolver: zodResolver(resetSchema) });

  async function onSubmit(values: ResetValues) {
    setFormError(null);
    const result = await updatePasswordAction(values);
    if (!result.ok) return setFormError(result.error);
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form method="post" onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {formError && <Alert tone="danger">{t(formError)}</Alert>}
      <Input id="password" type="password" autoComplete="new-password" label={t("auth.reset.newPassword")} hint={t("auth.passwordHint")}
        error={errors.password && t(errors.password.message ?? "errors.generic")} {...register("password")} />
      <Button type="submit" disabled={isSubmitting} size="lg">{t("auth.reset.submit")}</Button>
    </form>
  );
}
