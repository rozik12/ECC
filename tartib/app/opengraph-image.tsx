import { ImageResponse } from "next/og";

export const alt = "Tartib — trading discipline journal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Стандартный шрифт без кириллицы, поэтому картинка на латинице
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 96, background: "#080c12", color: "#e6eaf0" }}>
        <div style={{ fontSize: 40, letterSpacing: 12, color: "#5b95ff", fontWeight: 700 }}>TARTIB</div>
        <div style={{ fontSize: 76, fontWeight: 700, marginTop: 32, lineHeight: 1.1 }}>Trade by your rules, not by emotions.</div>
        <div style={{ fontSize: 32, marginTop: 32, color: "#94a0b0" }}>Risk calculator · Trade journal · Price of discipline</div>
      </div>
    ),
    size,
  );
}
