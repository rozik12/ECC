import { cn } from "@/lib/cn";

export function PoweredBy({ className }: { className?: string }) {
  return <p className={cn("text-xs text-muted", className)}>Powered by Rozikbek</p>;
}
