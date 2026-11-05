// Запасная картинка слитка: показывается, пока грузится 3D, и там, где 3D не нужен (слабые устройства, «меньше анимации»).
export function IngotFallback() {
  return (
    <svg viewBox="0 0 320 190" className="h-full w-full" aria-hidden focusable="false">
      <defs>
        <linearGradient id="ig-top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe08a" /><stop offset="1" stopColor="#e5a92e" /></linearGradient>
        <linearGradient id="ig-front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f0b93f" /><stop offset="1" stopColor="#b9801c" /></linearGradient>
        <linearGradient id="ig-side" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#d89b27" /><stop offset="1" stopColor="#8e5f12" /></linearGradient>
        <radialGradient id="ig-shadow"><stop offset="0" stopColor="#000" stopOpacity="0.35" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="165" cy="168" rx="118" ry="14" fill="url(#ig-shadow)" />
      <polygon points="62,118 236,118 262,152 36,152" fill="url(#ig-front)" />
      <polygon points="236,118 262,152 284,120 258,92" fill="url(#ig-side)" />
      <polygon points="92,70 258,92 236,118 62,118" fill="url(#ig-top)" />
      <text x="162" y="104" textAnchor="middle" fontFamily="Arial Black, Arial, sans-serif" fontWeight="700" fontSize="22" fill="#6b4608" opacity="0.85" transform="skewX(-8)">TARTIB</text>
      <polygon points="92,70 258,92 284,120" fill="none" stroke="#fff3c4" strokeOpacity="0.45" strokeWidth="1" />
    </svg>
  );
}
