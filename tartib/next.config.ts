import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Скриншоты сделок до 5 МБ передаются через серверное действие
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  /* config options here */
};

export default nextConfig;
