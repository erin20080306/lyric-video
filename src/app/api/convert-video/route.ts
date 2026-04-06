import { NextRequest, NextResponse } from "next/server";
import { execFile, exec } from "child_process";
import { writeFile, readFile, unlink, mkdir, access, chmod } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { constants } from "fs";

export const maxDuration = 60;

/**
 * WebM → MP4 轉檔 API
 * 接收 WebM (FormData)，回傳 MP4 (binary stream)
 */
export async function POST(request: NextRequest) {
  const id = randomUUID().slice(0, 8);
  const tmp = join(tmpdir(), `convert-${id}`);

  try {
    const formData = await request.formData();
    const file = formData.get("video") as File | null;

    if (!file) {
      return NextResponse.json({ error: "缺少影片檔案" }, { status: 400 });
    }

    console.log(`[convert-video] 收到 ${(file.size / 1024 / 1024).toFixed(2)}MB WebM`);
    await mkdir(tmp, { recursive: true });

    // 1. 寫入 WebM
    const buffer = Buffer.from(await file.arrayBuffer());
    const inputPath = join(tmp, "input.webm");
    await writeFile(inputPath, buffer);

    // 2. 輸出路徑
    const outputPath = join(tmp, "output.mp4");

    // 3. FFmpeg 路徑（多種方式取得）
    let ffmpegPath: string;
    try {
      ffmpegPath = require("ffmpeg-static");
      console.log("[convert-video] ffmpeg-static path:", ffmpegPath);
    } catch (e) {
      console.error("[convert-video] require ffmpeg-static failed:", e);
      return NextResponse.json({ error: "FFmpeg 未安裝: " + String(e) }, { status: 500 });
    }

    // 確保有執行權限
    try {
      await access(ffmpegPath, constants.X_OK);
    } catch {
      console.log("[convert-video] 設定 FFmpeg 執行權限...");
      await chmod(ffmpegPath, 0o755);
    }

    // 4. WebM → MP4
    await new Promise<void>((resolve, reject) => {
      execFile(
        ffmpegPath,
        [
          "-i", inputPath,
          "-c:v", "libx264",
          "-crf", "23",
          "-preset", "fast",
          "-c:a", "aac",
          "-b:a", "128k",
          "-pix_fmt", "yuv420p",
          "-movflags", "+faststart",
          "-y",
          outputPath,
        ],
        { timeout: 55000 },
        (error, _stdout, stderr) => {
          if (error) {
            console.error("[FFmpeg convert error]", error.message, stderr);
            reject(new Error(`FFmpeg 執行失敗: ${error.message}`));
          } else {
            console.log("[convert-video] FFmpeg 轉檔完成");
            resolve();
          }
        }
      );
    });

    // 5. 讀取 MP4 並回傳 binary
    const mp4Buffer = await readFile(outputPath);

    // 6. 清理
    await Promise.all([
      unlink(inputPath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
    ]);

    return new NextResponse(mp4Buffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="video.mp4"`,
      },
    });
  } catch (err) {
    console.error("[convert-video]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "轉檔失敗" },
      { status: 500 }
    );
  }
}
