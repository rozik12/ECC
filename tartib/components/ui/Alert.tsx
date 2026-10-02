import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export type AlertTone = "info" | "success" | "warning" | "danger";

const tones: Record<AlertTone, { box: string; icon: React.ElementType }> = {
  info: { box: "bg-primary-soft text-foreground border-primary/30", icon: Info },
  success: { box: "bg-success-soft text-foreground border-success/30", icon: CheckCircle2 },
  warning: { box: "bg-warning-soft text-foreground border-warning/30", icon: AlertTriangle },
  danger: { box: "bg-danger-soft text-foreground border-danger/30", icon: XCircle },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: AlertTone;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = tones[tone];
  return (
    <div role={tone === "danger" || tone === "warning" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border p-4", box, className)}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-1 text-muted" : ""}>{children}</div>}
      </div>
    </div>
  );
}
