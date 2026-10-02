import { AppShell } from "@/components/layout/AppShell";

// Защита входом появится на этапе 2. Сейчас разделы открыты, чтобы можно было посмотреть навигацию.
export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
