import { cn } from "@/lib/cn";

export const controlStyles =
  "w-full rounded-xl border bg-surface px-3 h-11 text-base sm:text-sm text-foreground placeholder:text-muted " +
  "focus:outline-2 focus:outline-offset-1 focus:outline-primary disabled:opacity-60";

type FieldProps = {
  id: string;
  label?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
};

/** Подпись, подсказка и сообщение об ошибке вокруг поля ввода. */
export function Field({ id, label, hint, error, children, className }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
