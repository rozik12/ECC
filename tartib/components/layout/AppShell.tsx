import { Disclaimer } from "./Disclaimer";
import { BottomNav, Sidebar, TopIcons } from "./AppNav";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

/** Каркас приватных страниц: сайдбар на компьютере, нижнее меню на телефоне. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="hidden border-r border-border bg-surface p-4 lg:block">
        <div className="sticky top-4 flex h-[calc(100vh-2rem)] flex-col gap-6">
          <Logo href="/dashboard" className="px-3" />
          <div className="min-h-0 flex-1">
            <Sidebar />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6">
          <Logo href="/dashboard" className="lg:hidden" />
          <div className="ml-auto flex items-center gap-1.5">
            <LanguageSwitcher />
            <ThemeToggle />
            <TopIcons />
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-28 sm:px-6 lg:pb-10">
          {children}
          <Disclaimer className="mt-10" />
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
