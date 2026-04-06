import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

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

    await mkdir(tmp, { recursive: true });

    // 1. 寫入 WebM
    const buffer = Buffer.from(await file.arrayBuffer());
    const inputPath = join(tmp, "input.webm");
    await writeFile(inputPath, buffer);

    // 2. 輸出路徑
    const outputPath = join(tmp, "output.mp4");

    // 3. FFmpeg 路徑
    let ffmpegPath: string;
    try {
      ffmpegPath = require("ffmpeg-static");
    } catch {
      return NextResponse.json({ error: "FFmpeg 未安裝" }, { status: 500 });
    }

    // 4. WebM → MP4 (保持原畫質，只轉容器格式)
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
            console.error("[FFmpeg convert error]", stderr);
            reject(new Error(`轉檔失敗: ${error.message}`));
          } else {
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
