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
          <Link href="/news" className="hidden text-sm text-muted hover:text-foreground sm:block">
            {t("nav.news")}
          </Link>
          <Link href="/tools" className="hidden text-sm text-muted hover:text-foreground sm:block">
            {t("nav.tools")}
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
      {/* На телефоне ссылки не помещаются в одну строку с кнопками, поэтому идут второй строкой */}
      <nav aria-label={t("nav.main")} className="flex gap-5 overflow-x-auto border-t border-border px-4 py-2 text-sm text-muted sm:hidden">
        {(["/news", "/tools", "/blog", "/pricing"] as const).map((href) => (
          <Link key={href} href={href} className="shrink-0 hover:text-foreground">
            {t(`nav.${href.slice(1)}`)}
          </Link>
        ))}
      </nav>
    </header>
  );
}
