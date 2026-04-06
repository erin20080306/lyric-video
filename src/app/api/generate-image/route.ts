import { NextRequest, NextResponse } from "next/server";

/**
 * 使用 Pollinations.ai 免費 AI 圖片生成（無需 API Key）
 * Fallback：SVG 漸層背景
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

    // 嘗試用 Pollinations.ai 生成 AI 圖片（含重試）
    const seed = Math.floor(Math.random() * 999999);
    const aiPrompt = `beautiful cinematic music album cover art, ${theme}, dreamy atmosphere, vibrant colors, aesthetic, no text, no words, no letters, 4k`;
    const encoded = encodeURIComponent(aiPrompt);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const trySeed = seed + attempt;
        const pollinationsUrl = `https://image.pollinations.ai/prompt/${encoded}?width=1280&height=720&nologo=true&seed=${trySeed}`;

        console.log(`[Image] Pollinations.ai 嘗試 #${attempt + 1}...`);

        const imgRes = await fetch(pollinationsUrl, {
          signal: AbortSignal.timeout(30000),
        });

        if (imgRes.ok) {
          const buffer = await imgRes.arrayBuffer();
          const base64 = Buffer.from(buffer).toString("base64");
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          const imageUrl = `data:${contentType};base64,${base64}`;

          console.log("[Image] AI 圖片生成完成, size:", base64.length);
          return NextResponse.json({ imageUrl });
        }

        if (imgRes.status === 429) {
          console.warn(`[Image] 被限速 (429)，等待 ${(attempt + 1) * 3} 秒後重試...`);
          await new Promise((r) => setTimeout(r, (attempt + 1) * 3000));
          continue;
        }

        console.warn("[Image] Pollinations 回傳:", imgRes.status);
        break;
      } catch (aiErr) {
        console.warn(`[Image] 嘗試 #${attempt + 1} 失敗:`, aiErr);
        if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
      }
    }

    // Fallback：SVG 漸層背景
    const colors = [
      ["#667eea", "#764ba2"],
      ["#f093fb", "#f5576c"],
      ["#4facfe", "#00f2fe"],
      ["#43e97b", "#38f9d7"],
      ["#fa709a", "#fee140"],
      ["#a18cd1", "#fbc2eb"],
    ];
    const [c1, c2] = colors[Math.floor(Math.random() * colors.length)];

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${c1};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${c2};stop-opacity:1" />
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" style="stop-color:white;stop-opacity:0.15" />
      <stop offset="100%" style="stop-color:white;stop-opacity:0" />
    </radialGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)" />
  <ellipse cx="640" cy="360" rx="500" ry="300" fill="url(#glow)" />
  <text x="640" y="340" text-anchor="middle" font-family="sans-serif" font-size="42" font-weight="bold" fill="white" opacity="0.9">${theme}</text>
  <text x="640" y="400" text-anchor="middle" font-family="sans-serif" font-size="20" fill="white" opacity="0.6">AI 一鍵歌詞影片產生器</text>
</svg>`;

    const base64 = Buffer.from(svg).toString("base64");
    const imageUrl = `data:image/svg+xml;base64,${base64}`;

    return NextResponse.json({ imageUrl });
  } catch (error) {
    return NextResponse.json(
      { error: "背景圖生成失敗，請稍後再試" },
      { status: 500 }
    );
  }
}
