import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Tartib: дисциплина трейдера",
    short_name: "Tartib",
    description: "Trading discipline journal: trades, rules, risk and the price of discipline",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f1419",
    theme_color: "#0f766e",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/pwa/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      // Знак лежит в центральной «безопасной» части, поэтому Android может безопасно скруглять иконку
      { src: "/pwa/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Быстрые действия при долгом нажатии на значок приложения
    shortcuts: [
      { name: "Новая сделка", short_name: "Сделка", url: "/trades/new", icons: [{ src: "/pwa/icon-192", sizes: "192x192", type: "image/png" }] },
      { name: "Калькулятор позиции", short_name: "Калькулятор", url: "/calculator", icons: [{ src: "/pwa/icon-192", sizes: "192x192", type: "image/png" }] },
      { name: "Статистика", short_name: "Статистика", url: "/statistics", icons: [{ src: "/pwa/icon-192", sizes: "192x192", type: "image/png" }] },
      { name: "Уведомления", short_name: "Уведомления", url: "/notifications", icons: [{ src: "/pwa/icon-192", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
