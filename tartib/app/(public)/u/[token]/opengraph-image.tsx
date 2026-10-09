import { ImageResponse } from "next/og";
import { disciplinePercent, getShareStats } from "@/lib/share";

export const alt = "Tartib — discipline card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Шрифт по умолчанию без кириллицы, поэтому картинка на латинице и без имени
export default async function ShareImage({ params }: { params: Promise<{ token: string }> }) {
  const stats = await getShareStats((await params).token);
  const percent = stats ? disciplinePercent(stats) : null;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 96, background: "#080c12", color: "#e6eaf0" }}>
        <div style={{ fontSize: 40, letterSpacing: 12, color: "#5b95ff", fontWeight: 700 }}>TARTIB</div>
        <div style={{ fontSize: 40, marginTop: 36, color: "#94a0b0" }}>Discipline, last 30 days</div>
        <div style={{ fontSize: 150, fontWeight: 700, lineHeight: 1.1 }}>{percent === null ? "—" : `${percent}%`}</div>
        <div style={{ fontSize: 36, marginTop: 16, color: "#94a0b0" }}>{stats ? `Streak: ${stats.streak} trades by the rules` : ""}</div>
      </div>
    ),
    size,
  );
}
