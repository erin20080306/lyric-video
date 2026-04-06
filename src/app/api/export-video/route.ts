import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { writeFile, readFile, unlink, mkdir, access, chmod } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { constants } from "fs";

// Vercel serverless timeout
export const maxDuration = 60;

/**
 * 伺服器端合成 MP4：靜態圖片 + 音訊 → 影片
 * iPhone / 所有裝置都能用
 */
export async function POST(request: NextRequest) {
  const id = randomUUID().slice(0, 8);
  const tmp = join(tmpdir(), `video-${id}`);

  try {
    const { imageBase64, audioBase64 } = await request.json();

    if (!imageBase64 || !audioBase64) {
      return NextResponse.json({ error: "缺少圖片或音訊資料" }, { status: 400 });
    }

    console.log("[export-video] 開始合成...");
    await mkdir(tmp, { recursive: true });

    // 1. 寫入圖片
    const imgMatch = imageBase64.match(/^data:image\/(\w+);base64,(.+)/);
    const imgExt = imgMatch?.[1] || "jpg";
    const imgData = Buffer.from(imgMatch?.[2] || imageBase64, "base64");
    const imgPath = join(tmp, `img.${imgExt}`);
    await writeFile(imgPath, imgData);

    // 2. 寫入音訊
    const audioMatch = audioBase64.match(/^data:audio\/(\w+);base64,(.+)/);
    const audioExt = audioMatch?.[1] || "mp3";
    const audioData = Buffer.from(audioMatch?.[2] || audioBase64, "base64");
    const audioPath = join(tmp, `audio.${audioExt}`);
    await writeFile(audioPath, audioData);

    // 3. 輸出路徑
    const outputPath = join(tmp, "output.mp4");

    // 4. 取得 FFmpeg 路徑
    let ffmpegPath: string;
    try {
      ffmpegPath = require("ffmpeg-static");
      console.log("[export-video] ffmpeg path:", ffmpegPath);
    } catch (e) {
      console.error("[export-video] require ffmpeg-static failed:", e);
      return NextResponse.json({ error: "FFmpeg 未安裝: " + String(e) }, { status: 500 });
    }

    // 確保有執行權限
    try {
      await access(ffmpegPath, constants.X_OK);
    } catch {
      await chmod(ffmpegPath, 0o755);
    }

    // 5. 執行 FFmpeg：靜態圖片 + 音訊 → MP4
    await new Promise<void>((resolve, reject) => {
      execFile(
        ffmpegPath,
        [
          "-loop", "1",
          "-i", imgPath,
          "-i", audioPath,
          "-c:v", "libx264",
          "-tune", "stillimage",
          "-r", "1",
          "-crf", "28",
          "-preset", "fast",
          "-c:a", "aac",
          "-b:a", "128k",
          "-pix_fmt", "yuv420p",
          "-shortest",
          "-movflags", "+faststart",
          "-y",
          outputPath,
        ],
        { timeout: 55000 },
        (error, _stdout, stderr) => {
          if (error) {
            console.error("[FFmpeg error]", stderr);
            reject(new Error(`FFmpeg 失敗: ${error.message}`));
          } else {
            resolve();
          }
        }
      );
    });

    // 6. 讀取並回傳 MP4
    const mp4Buffer = await readFile(outputPath);
    const mp4Base64 = mp4Buffer.toString("base64");

    // 7. 清理暫存
    await Promise.all([
      unlink(imgPath).catch(() => {}),
      unlink(audioPath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
    ]);

    return NextResponse.json({
      videoUrl: `data:video/mp4;base64,${mp4Base64}`,
    });
  } catch (err) {
    console.error("[export-video]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "影片合成失敗" },
      { status: 500 }
    );
  }
}
