import { ImageResponse } from "next/og";

// The app icon, drawn in code: the ember orb on the night background. Sizes 48–512;
// maskable icons keep the orb inside the safe zone.
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const size = Math.min(512, Math.max(48, Number(params.get("size")) || 192));
  const orb = Math.round(size * (params.get("maskable") ? 0.46 : 0.62));
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0D0B0A" }}>
      <div style={{ width: orb, height: orb, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%, #FFC08F, #F06A2A 60%, #7A2E0E)", boxShadow: `0 0 ${Math.round(size / 8)}px rgba(255,138,61,0.55)` }} />
    </div>,
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400, immutable" } },
  );
}
