import { BarChart3, Calculator, LayoutDashboard, ListChecks, Activity, CandlestickChart, Newspaper, NotebookText, Settings, User, Wrench } from "lucide-react";

export const mainNav = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/calculator", labelKey: "nav.calculator", icon: Calculator },
  { href: "/trades", labelKey: "nav.trades", icon: NotebookText },
  { href: "/rules", labelKey: "nav.rules", icon: ListChecks },
  { href: "/statistics", labelKey: "nav.statistics", icon: BarChart3 },
] as const;

export const secondaryNav = [
  { href: "/market", labelKey: "nav.market", icon: Activity },
  { href: "/charts", labelKey: "nav.charts", icon: CandlestickChart },
  { href: "/news", labelKey: "nav.news", icon: Newspaper },
  { href: "/tools", labelKey: "nav.tools", icon: Wrench },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
  { href: "/profile", labelKey: "nav.profile", icon: User },
] as const;
