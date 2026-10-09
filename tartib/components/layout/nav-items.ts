import { BarChart3, Calculator, LayoutDashboard, ListChecks, Newspaper, NotebookText, Settings, User } from "lucide-react";

export const mainNav = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/calculator", labelKey: "nav.calculator", icon: Calculator },
  { href: "/trades", labelKey: "nav.trades", icon: NotebookText },
  { href: "/rules", labelKey: "nav.rules", icon: ListChecks },
  { href: "/statistics", labelKey: "nav.statistics", icon: BarChart3 },
] as const;

export const secondaryNav = [
  { href: "/news", labelKey: "nav.news", icon: Newspaper },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
  { href: "/profile", labelKey: "nav.profile", icon: User },
] as const;
