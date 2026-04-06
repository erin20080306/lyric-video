const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ===== Health check =====
app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "lyric-video-server" });
});

// ===== ASS 字幕生成 =====
function formatASSTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function generateASS(title, lyrics, duration) {
  // ASS Header
  let ass = `[Script Info]
Title: ${title}
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Title,Noto Sans CJK TC,30,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,8,10,10,30,1
Style: Current,Noto Sans CJK TC,38,&H00FFFFFF,&H000000FF,&H00FA5C5C,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,5,10,10,10,1
Style: Dim,Noto Sans CJK TC,26,&H80FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,5,10,10,10,1
Style: Section,Noto Sans CJK TC,24,&H6000D7FF,&H000000FF,&H00000000,&H80000000,0,-1,0,0,100,100,0,0,1,1,1,5,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const endTime = formatASSTime(duration);

  // 標題 - 始終顯示在上方
  ass += `Dialogue: 0,0:00:00.00,${endTime},Title,,0,0,0,,${title}\n`;

  // 歌詞行
  for (let i = 0; i < lyrics.length; i++) {
    const line = lyrics[i];
    if (!line.text || line.text.trim() === "") continue;

    const start = formatASSTime(line.startTime);
    const end = formatASSTime(line.endTime);

    if (line.type === "section") {
      ass += `Dialogue: 1,${start},${end},Section,,0,0,0,,${line.text}\n`;
    } else if (line.type === "lyric") {
      // 當前行：大字白色帶光暈
      ass += `Dialogue: 2,${start},${end},Current,,0,0,0,,{\\fad(300,300)}${line.text}\n`;
    } else if (line.type === "title") {
      // 作詞作曲等資訊
      ass += `Dialogue: 1,${start},${end},Dim,,0,0,0,,${line.text}\n`;
    }
  }

  return ass;
}

// ===== 合成 MP4 API =====
app.post(
  "/api/create-video",
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "audio", maxCount: 1 },
  ]),
  async (req, res) => {
    const id = crypto.randomUUID().slice(0, 8);
    const tmp = path.join(os.tmpdir(), `video-${id}`);

    try {
      fs.mkdirSync(tmp, { recursive: true });

      const { title = "歌曲", lyrics: lyricsJson, duration: durationStr } = req.body;
      const imageFile = req.files?.image?.[0];
      const audioFile = req.files?.audio?.[0];

      if (!imageFile || !audioFile) {
        return res.status(400).json({ error: "缺少圖片或音訊" });
      }

      console.log(`[${id}] 開始合成: ${title} (image: ${(imageFile.size / 1024).toFixed(0)}KB, audio: ${(audioFile.size / 1024).toFixed(0)}KB)`);

      // 搬移檔案到 tmp
      const imgExt = path.extname(imageFile.originalname || ".jpg") || ".jpg";
      const audioExt = path.extname(audioFile.originalname || ".mp3") || ".mp3";
      const imgPath = path.join(tmp, `image${imgExt}`);
      const audioPath = path.join(tmp, `audio${audioExt}`);
      fs.renameSync(imageFile.path, imgPath);
      fs.renameSync(audioFile.path, audioPath);

      // 解析歌詞
      let lyrics = [];
      try {
        lyrics = JSON.parse(lyricsJson || "[]");
      } catch {}

      const duration = parseFloat(durationStr) || 60;

      // 生成 ASS 字幕
      let vfFilter = "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2";
      if (lyrics.length > 0) {
        const assContent = generateASS(title, lyrics, duration);
        const assPath = path.join(tmp, "lyrics.ass");
        fs.writeFileSync(assPath, assContent, "utf-8");
        // ASS 路徑需要轉義冒號和反斜線
        const escapedAssPath = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
        vfFilter = `scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,ass='${escapedAssPath}'`;
      }

      const outputPath = path.join(tmp, "output.mp4");

      // FFmpeg 合成
      const args = [
        "-loop", "1",
        "-i", imgPath,
        "-i", audioPath,
        "-vf", vfFilter,
        "-c:v", "libx264",
        "-tune", "stillimage",
        "-r", "10",
        "-crf", "25",
        "-preset", "fast",
        "-c:a", "aac",
        "-b:a", "128k",
        "-pix_fmt", "yuv420p",
        "-shortest",
        "-movflags", "+faststart",
        "-y",
        outputPath,
      ];

      console.log(`[${id}] FFmpeg 開始...`);

      await new Promise((resolve, reject) => {
        execFile("ffmpeg", args, { timeout: 120000 }, (error, _stdout, stderr) => {
          if (error) {
            console.error(`[${id}] FFmpeg error:`, stderr?.slice(-500));
            reject(new Error("FFmpeg 合成失敗"));
          } else {
            resolve();
          }
        });
      });

      const stat = fs.statSync(outputPath);
      console.log(`[${id}] 完成! ${(stat.size / 1024 / 1024).toFixed(2)}MB`);

      // 回傳 MP4
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(title)}.mp4"`);
      res.setHeader("Content-Length", stat.size);

      const stream = fs.createReadStream(outputPath);
      stream.pipe(res);
      stream.on("end", () => {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
      });
      stream.on("error", () => {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
      });
    } catch (err) {
      console.error(`[${id}] Error:`, err);
      res.status(500).json({ error: err.message || "影片合成失敗" });
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    }
  }
);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🎬 Video server running on port ${PORT}`);
});
