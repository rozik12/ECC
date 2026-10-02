import Link from "next/link";
import { cn } from "@/lib/cn";

/** Текстовый логотип. Позже заменим содержимое на SVG — остальной код не изменится. */
export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      aria-label="Tartib"
      className={cn("text-lg font-bold tracking-[0.2em] text-foreground", className)}
    >
      TARTIB
    </Link>
  );
}
