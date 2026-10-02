"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerAction } from "@/app/actions/auth";
import { Alert, Button, Input } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { registerSchema, type RegisterValues } from "@/lib/validations/auth";

export function RegisterForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(values: RegisterValues) {
    setFormError(null);
    const result = await registerAction(values);
    if (!result.ok) return setFormError(result.error);
    if (result.needsEmailConfirmation) return setCheckEmail(true);
    router.replace("/onboarding");
    router.refresh();
  }

  if (checkEmail) {
    return <Alert tone="success" title={t("auth.checkEmailTitle")}>{t("auth.checkEmailText")}</Alert>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {formError && <Alert tone="danger">{t(formError)}</Alert>}
      <Input id="name" autoComplete="name" label={t("auth.register.name")}
        error={errors.name && t(errors.name.message ?? "errors.generic")} {...register("name")} />
      <Input id="email" type="email" autoComplete="email" label={t("auth.email")}
        error={errors.email && t(errors.email.message ?? "errors.generic")} {...register("email")} />
      <Input id="password" type="password" autoComplete="new-password" label={t("auth.password")}
        hint={t("auth.passwordHint")}
        error={errors.password && t(errors.password.message ?? "errors.generic")} {...register("password")} />
      <Button type="submit" disabled={isSubmitting} size="lg">{t("auth.register.submit")}</Button>
    </form>
  );
}
