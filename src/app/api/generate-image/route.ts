import { NextRequest, NextResponse } from "next/server";

const IMAGE_STYLES = [
  "beautiful cinematic music album cover art, dreamy atmosphere, vibrant colors, aesthetic",
  "abstract watercolor painting, soft gradients, ethereal mood, artistic",
  "digital fantasy landscape, epic scenery, magical lighting, atmospheric",
  "neon cyberpunk cityscape, glowing lights, futuristic, moody",
  "impressionist oil painting, warm tones, romantic mood, classical art",
];

async function fetchImage(prompt: string, seed: number): Promise<string | null> {
  const encoded = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=1280&height=720&nologo=true&seed=${seed}`;

  for (let retry = 0; retry < 3; retry++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const ct = res.headers.get("content-type") || "image/jpeg";
        return `data:${ct};base64,${base64}`;
      }
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, (retry + 1) * 3000));
        continue;
      }
      break;
    } catch {
      if (retry < 2) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return null;
}

function makeSvgFallback(theme: string, c1: string, c2: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${c1};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${c2};stop-opacity:1" />
    </linearGradient>
    <radialGradient id="glow1" cx="30%" cy="30%" r="40%">
      <stop offset="0%" style="stop-color:white;stop-opacity:0.2" />
      <stop offset="100%" style="stop-color:white;stop-opacity:0" />
    </radialGradient>
    <radialGradient id="glow2" cx="70%" cy="70%" r="50%">
      <stop offset="0%" style="stop-color:white;stop-opacity:0.15" />
      <stop offset="100%" style="stop-color:white;stop-opacity:0" />
    </radialGradient>
    <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1" fill="white" opacity="0.1" />
    </pattern>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)" />
  <rect width="1280" height="720" fill="url(#dots)" />
  <ellipse cx="384" cy="216" rx="400" ry="250" fill="url(#glow1)" />
  <ellipse cx="896" cy="504" rx="500" ry="300" fill="url(#glow2)" />
  <circle cx="200" cy="150" r="80" fill="white" opacity="0.05" />
  <circle cx="1080" cy="570" r="120" fill="white" opacity="0.05" />
  <circle cx="640" cy="360" r="200" fill="none" stroke="white" opacity="0.08" stroke-width="2" />
  <text x="640" y="340" text-anchor="middle" font-family="sans-serif" font-size="48" font-weight="bold" fill="white" opacity="0.9">${theme}</text>
  <text x="640" y="390" text-anchor="middle" font-family="sans-serif" font-size="18" fill="white" opacity="0.6">AI Generated Background</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * 生成多張 AI 背景圖（Pollinations.ai，免費無需 API Key）
 * 回傳 imageUrls 陣列 + imageUrl（第一張，向下相容）
 */
export async function POST(request: NextRequest) {
  try {
    const { theme } = await request.json();

    if (!theme || typeof theme !== "string") {
      return NextResponse.json(
        { error: "請提供圖片主題" },
        { status: 400 }
      );
    }

    const seed = Math.floor(Math.random() * 999999);
    const style = IMAGE_STYLES[Math.floor(Math.random() * IMAGE_STYLES.length)];

    console.log("[Image] 生成 1 張 AI 圖片...");

    const imageUrl = await fetchImage(
      `${style}, ${theme}, no text, no words, no letters, 4k`,
      seed
    );

    if (imageUrl) {
      console.log("[Image] AI 圖片生成完成");
      return NextResponse.json({ imageUrl, seed, theme });
    }

    // Fallback
    const fallbackColors = [
      ["#667eea", "#764ba2"],
      ["#f093fb", "#f5576c"],
      ["#4facfe", "#00f2fe"],
    ];
    const [c1, c2] = fallbackColors[Math.floor(Math.random() * fallbackColors.length)];
    return NextResponse.json({
      imageUrl: makeSvgFallback(theme, c1, c2),
      seed,
      theme,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "背景圖生成失敗，請稍後再試" },
      { status: 500 }
    );
  }
}
