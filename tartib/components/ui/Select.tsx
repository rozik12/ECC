import { cn } from "@/lib/cn";
import { controlStyles, Field } from "./Field";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  id: string;
  label?: string;
  hint?: string;
  error?: string;
  ref?: React.Ref<HTMLSelectElement>;
};

export function Select({ id, label, hint, error, className, ref, children, ...props }: SelectProps) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(controlStyles, error ? "border-danger" : "border-border", className)}
        {...props}
      >
        {children}
      </select>
    </Field>
  );
}
