import { googleSignInAction } from "@/app/actions/auth";
import { Button } from "@/components/ui";
import { getTranslator } from "@/lib/i18n/server";

/** Показывается только если вход через Google включён (NEXT_PUBLIC_GOOGLE_AUTH=true). */
export async function GoogleButton() {
  if (process.env.NEXT_PUBLIC_GOOGLE_AUTH !== "true") return null;
  const { t } = await getTranslator();
  return (
    <div className="mb-6">
      <form action={googleSignInAction}>
        <Button type="submit" variant="secondary" size="lg" className="w-full">
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
            <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
            <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
            <path fill="#FBBC05" d="M5.4 14.3a7.200 7.200 0 0 1 0-4.600V6.600H1.400a12 12 0 0 0 0 10.800z" />
            <path fill="#EA4335" d="M12 4.800c1.800 0 3.300.6 4.500 1.800l3.400-3.400A12 12 0 0 0 1.400 6.600l4 3.100C6.300 6.900 8.900 4.800 12 4.800z" />
          </svg>
          {t("auth.google")}
        </Button>
      </form>
      <p className="mt-4 text-center text-xs uppercase tracking-wide text-muted">{t("auth.or")}</p>
    </div>
  );
}
