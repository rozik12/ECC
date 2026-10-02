"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";
import { mainNav, secondaryNav } from "./nav-items";

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/** Боковое меню на компьютере. */
export function Sidebar() {
  const { t } = useI18n();
  const isActive = useIsActive();

  const item = (href: string, labelKey: string, Icon: React.ElementType) => (
    <Link
      key={href}
      href={href}
      aria-current={isActive(href) ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
        isActive(href)
          ? "bg-primary-soft text-primary"
          : "text-muted hover:bg-surface-muted hover:text-foreground",
      )}
    >
      <Icon className="h-5 w-5" aria-hidden />
      {t(labelKey)}
    </Link>
  );

  return (
    <nav aria-label={t("nav.main")} className="flex h-full flex-col justify-between">
      <div className="flex flex-col gap-1">{mainNav.map((n) => item(n.href, n.labelKey, n.icon))}</div>
      <div className="flex flex-col gap-1 border-t border-border pt-3">
        {secondaryNav.map((n) => item(n.href, n.labelKey, n.icon))}
      </div>
    </nav>
  );
}

/** Нижнее меню на телефоне. */
export function BottomNav() {
  const { t } = useI18n();
  const isActive = useIsActive();

  return (
    <nav
      aria-label={t("nav.main")}
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {mainNav.map(({ href, labelKey, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "flex flex-col items-center gap-1 px-1 py-2 text-[11px] font-medium",
            isActive(href) ? "text-primary" : "text-muted",
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
          <span className="max-w-full truncate">{t(labelKey)}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Ссылки «Настройки» и «Профиль» в верхней панели на телефоне. */
export function TopIcons() {
  const { t } = useI18n();
  const isActive = useIsActive();
  return (
    <>
      {secondaryNav.map(({ href, labelKey, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-label={t(labelKey)}
          title={t(labelKey)}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg hover:bg-surface-muted lg:hidden",
            isActive(href) ? "text-primary" : "text-muted",
          )}
        >
          <Icon className="h-5 w-5" />
        </Link>
      ))}
    </>
  );
}
