import Link from "next/link";
import { cn } from "@/lib/cn";

/** Текстовый логотип. Позже заменим содержимое на SVG — остальной код не изменится. */
export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      aria-label="Tartib"
      className={cn("text-base font-bold tracking-[0.15em] text-foreground sm:text-lg sm:tracking-[0.2em]", className)}
    >
      TARTIB
    </Link>
  );
}
