import Link from "next/link";
import { getTranslator } from "@/lib/i18n/server";
import { Disclaimer } from "./Disclaimer";
import { Logo } from "./Logo";

export async function Footer() {
  const { t } = await getTranslator();
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <nav className="flex gap-5 text-sm text-muted">
            <Link href="/pricing" className="hover:text-foreground">{t("nav.pricing")}</Link>
            <Link href="/terms" className="hover:text-foreground">{t("footer.terms")}</Link>
            <Link href="/privacy" className="hover:text-foreground">{t("footer.privacy")}</Link>
          </nav>
        </div>
        <Disclaimer />
        <p className="text-xs text-muted">© {new Date().getFullYear()} Tartib. {t("footer.rights")}</p>
      </div>
    </footer>
  );
}
