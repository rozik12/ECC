import { GoogleButton } from "@/components/auth/GoogleButton";
import { PhoneLogin } from "@/components/auth/PhoneLogin";
import { getTranslator } from "@/lib/i18n/server";

/** Быстрые способы входа и регистрации: Google и номер телефона. */
export async function SocialAuth() {
  const { t } = await getTranslator();
  return (
    <div className="mb-6">
      <div className="space-y-3">
        <GoogleButton />
        <PhoneLogin />
      </div>
      <p className="mt-4 text-center text-xs uppercase tracking-wide text-muted">{t("auth.or")}</p>
    </div>
  );
}
