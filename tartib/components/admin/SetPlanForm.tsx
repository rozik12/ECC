"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminSetPlanAction } from "@/app/actions/admin";
import { Alert, Button, Card, Input, Select } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

export function SetPlanForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState("pro");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Card className="space-y-4">
      <h2 className="font-semibold">{t("admin.setPlan")}</h2>
      {error && <Alert tone="danger">{t(error)}</Alert>}
      {done && <Alert tone="success">{t("settings.saved")}</Alert>}
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
        <Input id="adm-email" type="email" label={t("auth.email")} value={email} onChange={(e) => setEmail(e.target.value)} />
        <Select id="adm-plan" label={t("profile.plan")} value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="pro">PRO</option>
          <option value="free">FREE</option>
        </Select>
        <Button
          disabled={pending || !email.includes("@")}
          onClick={() => {
            setError(null);
            setDone(false);
            startTransition(async () => {
              const result = await adminSetPlanAction(email, plan);
              if (!result.ok) return setError(result.error);
              setDone(true);
              router.refresh();
            });
          }}
        >
          {t("common.save")}
        </Button>
      </div>
    </Card>
  );
}
