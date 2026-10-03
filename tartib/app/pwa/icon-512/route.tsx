import { ImageResponse } from "next/og";

const SIZE = 512;

export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f766e", color: "#ffffff", fontSize: SIZE * 0.55, fontWeight: 700 }}>
        T
      </div>
    ),
    { width: SIZE, height: SIZE },
  );
}
