import { AlertTriangle, Scale, Target, Users, Wallet, BookOpen, BarChart3, Calculator, LayoutDashboard, ListChecks, Activity, CandlestickChart, Newspaper, NotebookText, Settings, User, Wrench } from "lucide-react";

export const mainNav = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/calculator", labelKey: "nav.calculator", icon: Calculator },
  { href: "/trades", labelKey: "nav.trades", icon: NotebookText },
  { href: "/rules", labelKey: "nav.rules", icon: ListChecks },
  { href: "/statistics", labelKey: "nav.statistics", icon: BarChart3 },
] as const;

/** Разделы рядом со статистикой */
export const statsNav = [
  { href: "/statistics/mistakes", labelKey: "nav.mistakes", icon: AlertTriangle },
  { href: "/statistics/pnl", labelKey: "nav.plusMinus", icon: Scale },
] as const;

export const secondaryNav = [
  { href: "/statistics/mistakes", labelKey: "nav.mistakes", icon: AlertTriangle },
  { href: "/diary", labelKey: "nav.diary", icon: BookOpen },
  { href: "/market", labelKey: "nav.market", icon: Activity },
  { href: "/portfolio", labelKey: "nav.portfolio", icon: Wallet },
  { href: "/prop", labelKey: "nav.prop", icon: Target },
  { href: "/charts", labelKey: "nav.charts", icon: CandlestickChart },
  { href: "/news", labelKey: "nav.news", icon: Newspaper },
  { href: "/tools", labelKey: "nav.tools", icon: Wrench },
  { href: "/trader-types", labelKey: "nav.traderTypes", icon: Users },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
  { href: "/profile", labelKey: "nav.profile", icon: User },
] as const;
