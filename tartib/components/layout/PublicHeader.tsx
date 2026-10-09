import Link from "next/link";
import { buttonStyles } from "@/components/ui";
import { getTranslator } from "@/lib/i18n/server";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

export async function PublicHeader() {
  const { t } = await getTranslator();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Logo />
          <Link href="/news" className="text-sm text-muted hover:text-foreground">
            {t("nav.news")}
          </Link>
          <Link href="/blog" className="hidden text-sm text-muted hover:text-foreground sm:block">
            {t("nav.blog")}
          </Link>
          <Link href="/pricing" className="hidden text-sm text-muted hover:text-foreground sm:block">
            {t("nav.pricing")}
          </Link>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
          <Link href="/login" className={buttonStyles({ variant: "ghost", size: "sm", className: "px-2 sm:px-3" })}>
            {t("nav.login")}
          </Link>
          <Link href="/register" className={buttonStyles({ size: "sm", className: "max-sm:hidden" })}>
            {t("nav.register")}
          </Link>
        </div>
      </div>
    </header>
  );
}
