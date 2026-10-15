import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

export const alt = "Template Taxonomy: visual search for design.com Instagram templates";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const swatches = ["#0f172a", "#f97316", "#facc15", "#22c55e", "#3b82f6", "#a855f7"];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "#f6f6f4",
          color: "#0f172a",
        }}
      >
        <div style={{ fontSize: 34, color: "#64748b" }}>{SITE_NAME}</div>
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1, marginTop: 16 }}>
          Visual search for 7,000 Instagram templates
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 48 }}>
          {swatches.map((c) => (
            <div key={c} style={{ width: 72, height: 72, borderRadius: 16, background: c }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
