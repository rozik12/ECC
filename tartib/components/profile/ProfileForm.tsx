"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfileAction } from "@/app/actions/settings";
import { Alert, Button, Input } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { profileSchema } from "@/lib/validations/settings";

export function ProfileForm({ name }: { name: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const parsed = profileSchema.safeParse({ name: value });
    if (!parsed.success) return setFieldError(parsed.error.issues[0]?.message);
    setFieldError(undefined);
    startTransition(async () => {
      const result = await updateProfileAction({ name: value });
      if (!result.ok) return setError(result.error);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert tone="danger">{t(error)}</Alert>}
      {saved && <Alert tone="success">{t("settings.saved")}</Alert>}
      <Input id="p-name" label={t("profile.name")} value={value} error={fieldError ? t(fieldError) : undefined} onChange={(e) => setValue(e.target.value)} />
      <Button type="submit" disabled={pending}>{t("common.save")}</Button>
    </form>
  );
}
