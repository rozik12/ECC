import { cn } from "@/lib/cn";

/** На телефоне строки таблицы показываются карточками (см. .responsive-table в globals.css). */
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="md:overflow-x-auto">
      <table className={cn("responsive-table w-full text-left text-sm", className)} {...props} />
    </div>
  );
}

export function THead(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />;
}

export function TBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("md:border-b md:border-border", className)} {...props} />;
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted", className)} {...props} />;
}

/** label — подпись колонки, которая видна на телефоне. */
export function Td({
  className,
  label,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { label?: string }) {
  return <td data-label={label} className={cn("px-3 py-3 md:align-middle", className)} {...props} />;
}
