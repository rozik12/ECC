import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { getTranslator } from "@/lib/i18n/server";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Disclaimer } from "./Disclaimer";
import { BottomNav, Sidebar, TopIcons } from "./AppNav";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Logo } from "./Logo";
import { PoweredBy } from "./PoweredBy";
import { Shortcuts } from "./Shortcuts";
import { ThemeToggle } from "./ThemeToggle";

/** Каркас приватных страниц: сайдбар на компьютере, нижнее меню на телефоне. */
export async function AppShell({ children, unread }: { children: React.ReactNode; unread?: number }) {
  const { t } = await getTranslator();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr] print:block">
      <aside className="hidden print:hidden border-r border-border bg-surface p-4 lg:block">
        <div className="sticky top-4 flex h-[calc(100vh-2rem)] flex-col gap-6">
          <Logo href="/dashboard" className="px-3" />
          <div className="min-h-0 flex-1">
            <Sidebar />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 print:hidden border-b border-border bg-background/90 backdrop-blur">
          <div className="flex h-14 items-center justify-between gap-2 px-4 sm:px-6">
          <Logo href="/dashboard" className="lg:hidden" />
          <div className="ml-auto flex items-center gap-1.5">
            <LanguageSwitcher />
            <ThemeToggle />
            {unread !== undefined && <NotificationBell initial={unread} />}
            <form action={logoutAction}>
              <button
                type="submit"
                aria-label={t("auth.logout")}
                title={t("auth.logout")}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-muted hover:text-foreground"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </form>
          </div>
          </div>
          <TopIcons />
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-28 sm:px-6 lg:pb-10">
          {children}
          <Disclaimer className="mt-10" />
          <PoweredBy className="mt-3" />
          <div className="print:hidden"><Shortcuts /></div>
        </main>
      </div>

      <div className="print:hidden"><BottomNav /></div>
    </div>
  );
}
