"use client";

import { useState, useRef, useCallback } from "react";
import { Download, Loader2, Square } from "lucide-react";
import { parseLyrics, getVisibleLines } from "@/lib/lyrics-parser";

interface VideoExporterProps {
  imageUrl: string;
  audioUrl: string;
  lyrics: string;
  title: string;
}

export default function VideoExporter({
  imageUrl,
  audioUrl,
  lyrics,
  title,
}: VideoExporterProps) {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const cancelRef = useRef(false);

  const exportVideo = useCallback(async () => {
    setExporting(true);
    setProgress(0);
    cancelRef.current = false;

    try {
      // 1. 建立 Canvas
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d")!;

      // 2. 載入背景圖
      const bgImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = imageUrl;
      });

      // 3. 載入音訊並取得 duration
      const audio = new Audio();
      audio.crossOrigin = "anonymous";
      audio.src = audioUrl;
      await new Promise<void>((resolve) => {
        audio.oncanplaythrough = () => resolve();
        audio.load();
      });

      const duration = audio.duration;
      if (!duration || duration <= 0) {
        throw new Error("無法讀取音訊長度");
      }

      // 4. 解析歌詞
      const lyricLines = parseLyrics(lyrics, duration);

      // 5. 設定 MediaRecorder
      const canvasStream = canvas.captureStream(30); // 30 FPS

      // 嘗試從音訊取得 stream
      let combinedStream: MediaStream;
      try {
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaElementSource(audio);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);
        source.connect(audioCtx.destination); // 同時播放

        combinedStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...dest.stream.getAudioTracks(),
        ]);
      } catch {
        // 如果音訊 stream 失敗，只錄影片
        combinedStream = canvasStream;
      }

      // 選擇支援的格式
      const mimeTypes = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
        "video/mp4",
      ];
      let mimeType = "";
      for (const mt of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mt)) {
          mimeType = mt;
          break;
        }
      }

      if (!mimeType) {
        throw new Error("瀏覽器不支援影片錄製，請使用 Chrome");
      }

      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 2500000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      // 6. 繪製函式
      const drawFrame = (currentTime: number) => {
        // 背景圖（cover fit）
        const imgRatio = bgImg.width / bgImg.height;
        const canvasRatio = canvas.width / canvas.height;
        let sx = 0, sy = 0, sw = bgImg.width, sh = bgImg.height;
        if (imgRatio > canvasRatio) {
          sw = bgImg.height * canvasRatio;
          sx = (bgImg.width - sw) / 2;
        } else {
          sh = bgImg.width / canvasRatio;
          sy = (bgImg.height - sh) / 2;
        }
        ctx.drawImage(bgImg, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

        // 暗化
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 上方漸層
        const topGrad = ctx.createLinearGradient(0, 0, 0, 120);
        topGrad.addColorStop(0, "rgba(0,0,0,0.6)");
        topGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = topGrad;
        ctx.fillRect(0, 0, canvas.width, 120);

        // 下方漸層
        const botGrad = ctx.createLinearGradient(0, canvas.height - 150, 0, canvas.height);
        botGrad.addColorStop(0, "rgba(0,0,0,0)");
        botGrad.addColorStop(1, "rgba(0,0,0,0.8)");
        ctx.fillStyle = botGrad;
        ctx.fillRect(0, canvas.height - 150, canvas.width, 150);

        // 標題
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = "bold 28px sans-serif";
        ctx.fillText(title, canvas.width / 2, 50);

        // 歌詞
        const { current, visible } = getVisibleLines(lyricLines, currentTime, 7);
        const centerY = canvas.height / 2;
        const lineHeight = 52;
        const startY = centerY - ((visible.length - 1) / 2) * lineHeight;

        visible.forEach((line, idx) => {
          const y = startY + idx * lineHeight;
          const isCurrent = line.id === current?.id;

          if (line.type === "empty") return;

          if (isCurrent) {
            ctx.font = "bold 36px sans-serif";
            ctx.fillStyle = "rgba(255,255,255,1)";
            // 發光效果
            ctx.shadowColor = "rgba(92,124,250,0.8)";
            ctx.shadowBlur = 20;
          } else {
            ctx.font = "24px sans-serif";
            ctx.fillStyle = "rgba(255,255,255,0.45)";
            ctx.shadowBlur = 0;
          }

          ctx.fillText(line.text, canvas.width / 2, y);
          ctx.shadowBlur = 0;
        });

        // 進度條
        const barY = canvas.height - 10;
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fillRect(0, barY, canvas.width, 6);
        const prog = duration > 0 ? currentTime / duration : 0;
        ctx.fillStyle = "rgba(92,124,250,0.9)";
        ctx.fillRect(0, barY, canvas.width * prog, 6);
      };

      // 7. 開始錄製 + 播放
      return new Promise<void>((resolve) => {
        recorder.onstop = () => {
          const ext = mimeType.includes("mp4") ? "mp4" : "webm";
          const blob = new Blob(chunks, { type: mimeType });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${title}.${ext}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setExporting(false);
          setProgress(100);
          resolve();
        };

        recorder.start(100);
        audio.currentTime = 0;
        audio.play();

        const animate = () => {
          if (cancelRef.current) {
            audio.pause();
            recorder.stop();
            return;
          }

          const t = audio.currentTime;
          setProgress(Math.round((t / duration) * 100));
          drawFrame(t);

          if (t < duration && !audio.ended) {
            requestAnimationFrame(animate);
          } else {
            audio.pause();
            // 多畫最後一幀
            drawFrame(duration);
            setTimeout(() => recorder.stop(), 200);
          }
        };

        animate();
      });
    } catch (err) {
      console.error("[VideoExporter]", err);
      alert("影片匯出失敗：" + (err instanceof Error ? err.message : "未知錯誤"));
      setExporting(false);
    }
  }, [imageUrl, audioUrl, lyrics, title]);

  const cancelExport = () => {
    cancelRef.current = true;
  };

  return (
    <div className="flex items-center gap-3">
      {exporting ? (
        <>
          <button
            onClick={cancelExport}
            className="btn-primary bg-red-600 hover:bg-red-500 py-3 px-6"
          >
            <Square className="w-4 h-4" />
            取消
          </button>
          <div className="flex items-center gap-3 flex-1">
            <Loader2 className="w-5 h-5 text-primary-400 animate-spin" />
            <div className="flex-1">
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <span className="text-sm text-gray-400 tabular-nums w-12 text-right">
              {progress}%
            </span>
          </div>
        </>
      ) : (
        <button onClick={exportVideo} className="btn-primary py-3 px-6">
          <Download className="w-5 h-5" />
          下載影片（可分享 FB）
        </button>
      )}
    </div>
  );
}
