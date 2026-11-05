import { cn } from "@/lib/cn";
import { initials } from "@/lib/chat";

const COLORS = ["bg-sky-500/20 text-sky-300", "bg-emerald-500/20 text-emerald-300", "bg-amber-500/20 text-amber-300", "bg-violet-500/20 text-violet-300", "bg-rose-500/20 text-rose-300", "bg-teal-500/20 text-teal-300"];

/** Круглая «аватарка» с первыми буквами; цвет зависит от строки, чтобы у одного человека он не менялся. */
export function Avatar({ name, handle, seed, size = "md", group = false }: { name?: string | null; handle?: string | null; seed: string; size?: "sm" | "md" | "lg"; group?: boolean }) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", COLORS[h % COLORS.length], size === "sm" ? "h-7 w-7 text-[10px]" : size === "lg" ? "h-12 w-12 text-base" : "h-10 w-10 text-sm", group && "rounded-2xl")}>
      {group ? (name ?? "#").trim().slice(0, 2).toUpperCase() || "#" : initials(name, handle)}
    </span>
  );
}
