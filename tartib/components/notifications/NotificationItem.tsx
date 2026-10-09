"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Award, Bell, BellRing, FileText, Megaphone, Target, TriangleAlert } from "lucide-react";
import { markNotificationReadAction } from "@/app/actions/notifications";
import { cn } from "@/lib/cn";

const ICONS = { achievement: Award, violation: TriangleAlert, goal: Target, report: FileText, announcement: Megaphone, price_alert: BellRing } as const;

export type ItemData = { id: string; kind: string; title: string; body: string; href: string | null; ago: string; iso: string; unread: boolean };

/** Одно уведомление. Нажатие помечает его прочитанным и, если есть куда, открывает нужную страницу. */
export function NotificationItem({ n }: { n: ItemData }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const Icon = ICONS[n.kind as keyof typeof ICONS] ?? Bell;

  const content = (
    <>
      <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full", n.unread ? "bg-primary-soft text-primary" : "bg-surface-muted text-muted")}>
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block leading-snug", n.unread ? "font-semibold" : "font-medium")}>{n.title}</span>
        {n.body && <span className="mt-0.5 block break-words text-sm text-muted">{n.body}</span>}
        <time dateTime={n.iso} className="mt-1 block text-xs text-muted">{n.ago}</time>
      </span>
      {n.unread && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-hidden />}
    </>
  );
  const cls = cn("flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:border-primary/50 sm:p-4", n.unread ? "border-primary/40 bg-primary-soft/40" : "border-border bg-surface");
  const markRead = () => n.unread && startTransition(async () => { await markNotificationReadAction(n.id); router.refresh(); });

  return n.href ? (
    <Link href={n.href} onClick={markRead} className={cls}>{content}</Link>
  ) : (
    <button type="button" onClick={markRead} className={cls}>{content}</button>
  );
}
