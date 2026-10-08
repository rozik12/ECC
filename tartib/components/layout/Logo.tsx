import Link from "next/link";
import { cn } from "@/lib/cn";

/** Знак Tartib: буква T с галочкой («порядок»). Тот же рисунок, что в public/logo и в иконках приложения. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("h-8 w-8 shrink-0", className)}>
      <defs>
        <linearGradient id="tartib-logo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#0f9d8d" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#tartib-logo-gradient)" />
      <rect x="14" y="15" width="36" height="10" rx="4" fill="#06201c" />
      <rect x="26" y="15" width="12" height="35" rx="4" fill="#06201c" />
      <path d="M41 43l5.2 5.2L55 37" fill="none" stroke="#06201c" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      aria-label="Tartib"
      className={cn("inline-flex items-center gap-2.5 text-base font-bold tracking-[0.15em] text-foreground sm:text-lg sm:tracking-[0.2em]", className)}
    >
      <LogoMark />
      <span aria-hidden>TARTIB</span>
    </Link>
  );
}
