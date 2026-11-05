// Запасные картинки для 3D-сцен: показываются, пока грузится 3D, и там, где 3D не нужен.
import { IngotFallback } from "./IngotFallback";

/** Главная: логотип и слиток. */
export function HeroFallback() {
  return (
    <div className="flex h-full items-center justify-center gap-4" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo/tartib-mark-512.png" alt="" width={512} height={512} className="h-2/5 max-h-44 w-auto rounded-3xl shadow-lg" />
      <div className="h-1/3 w-44 max-w-[45%]"><IngotFallback /></div>
    </div>
  );
}

/** Металлы: слиток. */
export function MetalsFallback() {
  return <div className="flex h-full items-center justify-center" aria-hidden><div className="h-full max-h-40 w-56"><IngotFallback /></div></div>;
}
