"use client";

import { ErrorState } from "@/components/layout/ErrorState";

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-5xl px-4">
      <ErrorState {...props} />
    </main>
  );
}
