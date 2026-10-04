"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginAction } from "@/app/actions/auth";
import { Alert, Button, Input } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { loginSchema, type LoginValues } from "@/lib/validations/auth";

export function LoginForm({ onNeedsMfa }: { onNeedsMfa?: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginValues) {
    setFormError(null);
    const result = await loginAction(values);
    if (!result.ok) return setFormError(result.error);
    if (result.needsMfa) return onNeedsMfa?.();
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form method="post" onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {formError && <Alert tone="danger">{t(formError)}</Alert>}
      <Input id="email" type="email" autoComplete="email" label={t("auth.email")}
        error={errors.email && t(errors.email.message ?? "errors.generic")} {...register("email")} />
      <Input id="password" type="password" autoComplete="current-password" label={t("auth.password")}
        error={errors.password && t(errors.password.message ?? "errors.generic")} {...register("password")} />
      <Button type="submit" disabled={isSubmitting} size="lg">{t("auth.login.submit")}</Button>
    </form>
  );
}
