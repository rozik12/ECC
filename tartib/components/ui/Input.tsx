import { cn } from "@/lib/cn";
import { controlStyles, Field } from "./Field";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label?: string;
  hint?: string;
  error?: string;
  ref?: React.Ref<HTMLInputElement>;
};

export function Input({ id, label, hint, error, className, ref, ...props }: InputProps) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(controlStyles, error ? "border-danger" : "border-border", className)}
        {...props}
      />
    </Field>
  );
}
