import { cn } from "@/lib/cn";

type CardProps = React.HTMLAttributes<HTMLDivElement> & { padded?: boolean };

export function Card({ className, padded = true, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "card-enter surface-card rounded-2xl",
        padded && "p-5 sm:p-6",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold", className)} {...props} />;
}
