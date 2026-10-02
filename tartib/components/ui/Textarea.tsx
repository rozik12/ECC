import { cn } from "@/lib/cn";
import { controlStyles, Field } from "./Field";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  id: string;
  label?: string;
  hint?: string;
  error?: string;
  ref?: React.Ref<HTMLTextAreaElement>;
};

export function Textarea({ id, label, hint, error, className, ref, ...props }: TextareaProps) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        ref={ref}
        rows={3}
        aria-invalid={error ? true : undefined}
        className={cn(controlStyles, "h-auto min-h-20 py-2", error ? "border-danger" : "border-border", className)}
        {...props}
      />
    </Field>
  );
}
