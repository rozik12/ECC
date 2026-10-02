import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { SetupNotice } from "@/components/auth/SetupNotice";
import { requireUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Приватные страницы не нужны поисковикам
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  // Без ключей Supabase показываем подсказку вместо страницы входа (удобно при первой настройке)
  if (!isSupabaseConfigured()) {
    return (
      <AppShell>
        <SetupNotice />
        {children}
      </AppShell>
    );
  }
  const { profile } = await requireUser();
  if (!profile?.onboarded) redirect("/onboarding");
  return <AppShell>{children}</AppShell>;
}
