import { PoweredBy } from "@/components/layout/PoweredBy";
import Link from "next/link";
import { buttonStyles } from "@/components/ui";
import { Logo } from "@/components/layout/Logo";
import { getTranslator } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getTranslator();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <p className="text-5xl font-bold">404</p>
      <p className="text-lg font-semibold">{t("states.notFoundTitle")}</p>
      <p className="text-muted">{t("states.notFoundText")}</p>
      <Link href="/" className={buttonStyles({ className: "mt-2" })}>{t("states.home")}</Link>
      <PoweredBy className="mt-6" />
    </main>
  );
}
