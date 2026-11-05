import { cn } from "@/lib/cn";

/** Серая заглушка, пока данные загружаются. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-surface-muted", className)} />;
}
