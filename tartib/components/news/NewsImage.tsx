"use client";

import { useEffect, useRef } from "react";

/** Превью новости. Если картинка не загрузилась (источник её закрыл), блок с ней скрывается, а не показывает «битый» значок. */
export function NewsImage({ src, className }: { src: string; className?: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const hide = (img: HTMLImageElement) => {
    const box = img.parentElement;
    if (box) box.style.display = "none";
  };
  useEffect(() => {
    const img = ref.current;
    // Ошибка могла случиться до того, как страница «ожила»
    if (img && img.complete && img.naturalWidth === 0) hide(img);
  }, []);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- картинки с чужих сайтов, оптимизатор Next не нужен
    <img ref={ref} src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className={className} onError={(e) => hide(e.currentTarget)} />
  );
}
