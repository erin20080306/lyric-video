"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Download, Loader2, Square, Music, ImageIcon, Film } from "lucide-react";
import { parseLyrics, getVisibleLines } from "@/lib/lyrics-parser";

interface VideoExporterProps {
  imageUrl: string;
  audioUrl: string;
  lyrics: string;
  title: string;
}

/** 把 base64 data URL 轉成 Blob */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "application/octet-stream";
  const binary = atob(base64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** 手機相容的 Blob 下載 */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);

  // iOS Safari: window.open 比 <a> download 更可靠
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS) {
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

function canRecordVideo(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const hasCapture = typeof canvas.captureStream === "function";
    const hasRecorder = typeof MediaRecorder !== "undefined";
    if (!hasCapture || !hasRecorder) return false;
    const testTypes = ["video/webm", "video/mp4"];
    return testTypes.some((t) => MediaRecorder.isTypeSupported(t));
  } catch {
    return false;
  }
}

export default function VideoExporter({
  imageUrl,
  audioUrl,
  lyrics,
  title,
}: VideoExporterProps) {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadingMp3, setDownloadingMp3] = useState(false);
  const cancelRef = useRef(false);
  const [supportsVideo, setSupportsVideo] = useState(true);

  useEffect(() => {
    setSupportsVideo(canRecordVideo());
  }, []);

  // ===== MP3 下載（手機 + 桌面都能用）=====
  const downloadAudio = useCallback(async () => {
    setDownloadingMp3(true);
    try {
      let blob: Blob;
      if (audioUrl.startsWith("data:")) {
        blob = dataUrlToBlob(audioUrl);
      } else {
        const res = await fetch(audioUrl);
        blob = await res.blob();
      }
      // 確保 MIME 是 audio/mpeg
      if (!blob.type.includes("audio")) {
        blob = new Blob([blob], { type: "audio/mpeg" });
      }
      downloadBlob(blob, `${title}.mp3`);
    } catch (err) {
      console.error("[下載MP3]", err);
      alert("MP3 下載失敗，請長按播放器試試");
    } finally {
      setDownloadingMp3(false);
    }
  }, [audioUrl, title]);

  // ===== 背景圖下載 =====
  const downloadImage = useCallback(() => {
    try {
      let blob: Blob;
      if (imageUrl.startsWith("data:")) {
        blob = dataUrlToBlob(imageUrl);
      } else {
        // 不太可能走到這裡
        const a = document.createElement("a");
        a.href = imageUrl;
        a.download = `${title}-背景圖.jpg`;
        a.click();
        return;
      }
      downloadBlob(blob, `${title}-背景圖.jpg`);
    } catch (err) {
      console.error("[下載圖片]", err);
      alert("圖片下載失敗");
    }
  }, [imageUrl, title]);

  // ===== MP4/WebM 影片錄製（需要 MediaRecorder）=====
  const exportVideo = useCallback(async () => {
    setExporting(true);
    setProgress(0);
    cancelRef.current = false;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d")!;

      const bgImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = imageUrl;
      });

      const audio = new Audio();
      audio.crossOrigin = "anonymous";
      audio.src = audioUrl;
      await new Promise<void>((resolve) => {
        audio.oncanplaythrough = () => resolve();
        audio.load();
      });

      const duration = audio.duration;
      if (!duration || duration <= 0) throw new Error("無法讀取音訊長度");

      const lyricLines = parseLyrics(lyrics, duration);
      const canvasStream = canvas.captureStream(30);

      let combinedStream: MediaStream;
      try {
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaElementSource(audio);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);
        source.connect(audioCtx.destination);
        combinedStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...dest.stream.getAudioTracks(),
        ]);
      } catch {
        combinedStream = canvasStream;
      }

      const mimeTypes = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4",
      ];
      let mimeType = "";
      for (const mt of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mt)) { mimeType = mt; break; }
      }
      if (!mimeType) throw new Error("瀏覽器不支援影片錄製");

      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 2500000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const drawFrame = (currentTime: number) => {
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

        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const topGrad = ctx.createLinearGradient(0, 0, 0, 120);
        topGrad.addColorStop(0, "rgba(0,0,0,0.6)");
        topGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = topGrad;
        ctx.fillRect(0, 0, canvas.width, 120);

        const botGrad = ctx.createLinearGradient(0, canvas.height - 150, 0, canvas.height);
        botGrad.addColorStop(0, "rgba(0,0,0,0)");
        botGrad.addColorStop(1, "rgba(0,0,0,0.8)");
        ctx.fillStyle = botGrad;
        ctx.fillRect(0, canvas.height - 150, canvas.width, 150);

        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = "bold 28px sans-serif";
        ctx.fillText(title, canvas.width / 2, 50);

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

        const barY = canvas.height - 10;
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fillRect(0, barY, canvas.width, 6);
        const prog = duration > 0 ? currentTime / duration : 0;
        ctx.fillStyle = "rgba(92,124,250,0.9)";
        ctx.fillRect(0, barY, canvas.width * prog, 6);
      };

      return new Promise<void>((resolve) => {
        recorder.onstop = () => {
          const ext = mimeType.includes("mp4") ? "mp4" : "webm";
          const blob = new Blob(chunks, { type: mimeType });
          downloadBlob(blob, `${title}.${ext}`);
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
    <div className="space-y-4">
      {/* MP3 下載 - 所有裝置都能用 */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={downloadAudio}
          disabled={downloadingMp3}
          className="btn-primary py-3 px-5"
        >
          {downloadingMp3 ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> 處理中...</>
          ) : (
            <><Music className="w-5 h-5" /> 下載 MP3 音樂</>
          )}
        </button>

        <button onClick={downloadImage} className="btn-primary py-3 px-5 bg-purple-600 hover:bg-purple-500">
          <ImageIcon className="w-5 h-5" />
          下載背景圖
        </button>
      </div>

      {/* MP4 影片 - 支援的瀏覽器才顯示 */}
      {supportsVideo && (
        <>
          {exporting ? (
            <div className="flex items-center gap-3">
              <button
                onClick={cancelExport}
                className="btn-primary bg-red-600 hover:bg-red-500 py-3 px-5"
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
            </div>
          ) : (
            <button onClick={exportVideo} className="btn-primary py-3 px-5 bg-green-600 hover:bg-green-500">
              <Film className="w-5 h-5" />
              下載 MP4 影片（含歌詞字幕）
            </button>
          )}
        </>
      )}

      {!supportsVideo && (
        <p className="text-xs text-gray-500">
          💡 MP4 影片需在電腦版 Chrome 下載。手機可用 MP3 + 背景圖，搭配剪映/CapCut 合成影片。
        </p>
      )}
    </div>
  );
}
