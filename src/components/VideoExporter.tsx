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

/** 手機 + 桌面通用下載/分享 */
async function downloadOrShare(blob: Blob, filename: string) {
  // 手機優先用 Web Share API（可直接分享到 FB/IG/LINE）
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        title: filename,
        files: [file],
      });
      return;
    } catch (e) {
      // 使用者取消分享，fallback 到下載
      if ((e as Error).name === "AbortError") return;
    }
  }

  // fallback: <a download>
  const url = URL.createObjectURL(blob);
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
  const [timeInfo, setTimeInfo] = useState("");
  const [downloadingMp3, setDownloadingMp3] = useState(false);
  const [creatingVideo, setCreatingVideo] = useState(false);
  const stopRef = useRef(false);
  const [supportsVideo, setSupportsVideo] = useState(true);

  useEffect(() => {
    setSupportsVideo(canRecordVideo());
  }, []);

  // ===== 客戶端合成 MP4（iPhone 等不支援 MediaRecorder 的裝置）=====
  const createClientVideo = useCallback(async () => {
    setCreatingVideo(true);
    try {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { fetchFile } = await import("@ffmpeg/util");
      const ffmpeg = new FFmpeg();

      setTimeInfo("載入轉檔工具（首次約 10 秒）...");
      await ffmpeg.load({
        coreURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js",
        wasmURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm",
      });

      setTimeInfo("準備素材...");
      // 寫入圖片
      const imgBlob = dataUrlToBlob(imageUrl);
      await ffmpeg.writeFile("img.jpg", await fetchFile(imgBlob));

      // 寫入音訊
      let audioBlob: Blob;
      if (audioUrl.startsWith("data:")) {
        audioBlob = dataUrlToBlob(audioUrl);
      } else {
        const res = await fetch(audioUrl);
        audioBlob = await res.blob();
      }
      const audioExt = audioBlob.type.includes("wav") ? "wav" : "mp3";
      await ffmpeg.writeFile(`audio.${audioExt}`, await fetchFile(audioBlob));

      setTimeInfo("合成 MP4 中...");
      await ffmpeg.exec([
        "-loop", "1",
        "-i", "img.jpg",
        "-i", `audio.${audioExt}`,
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
        "-y", "output.mp4",
      ]);

      const data = await ffmpeg.readFile("output.mp4");
      const mp4Blob = new Blob([new Uint8Array(data as Uint8Array)], { type: "video/mp4" });
      await downloadOrShare(mp4Blob, `${title}.mp4`);
    } catch (err) {
      console.error("[ffmpeg.wasm 合成失敗]", err);
      alert("影片合成失敗：" + (err instanceof Error ? err.message : "未知錯誤") + "\n請改用「下載 MP3 + 背景圖」搭配剪映合成");
    } finally {
      setCreatingVideo(false);
      setTimeInfo("");
    }
  }, [imageUrl, audioUrl, title]);

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
      downloadOrShare(blob, `${title}.mp3`);
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
      downloadOrShare(blob, `${title}-背景圖.jpg`);
    } catch (err) {
      console.error("[下載圖片]", err);
      alert("圖片下載失敗");
    }
  }, [imageUrl, title]);

  // ===== 載入圖片 =====
  const loadImg = (src: string, timeout = 10000): Promise<HTMLImageElement | null> =>
    Promise.race([
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      }),
      new Promise<null>((r) => setTimeout(() => r(null), timeout)),
    ]).catch(() => null);

  // ===== MP4/WebM 影片錄製（多圖輪播 + 停止即下載）=====
  const exportVideo = useCallback(async () => {
    setExporting(true);
    setProgress(0);
    setTimeInfo("準備圖片中...");
    stopRef.current = false;

    try {
      // 1. 載入主圖 + 2 張額外圖（並行，最多等 8 秒）
      const bgImages: HTMLImageElement[] = [];
      const mainImg = await loadImg(imageUrl, 15000);
      if (!mainImg) throw new Error("無法載入背景圖");
      bgImages.push(mainImg);

      const extraStyles = [
        "watercolor painting, soft gradients, ethereal mood",
        "digital fantasy landscape, magical lighting, epic",
      ];
      setTimeInfo("載入額外圖片...");
      const extras = await Promise.all(
        extraStyles.map((style) => {
          const seed = Math.floor(Math.random() * 999999);
          const p = encodeURIComponent(`${style}, ${title}, no text, 4k`);
          return loadImg(
            `https://image.pollinations.ai/prompt/${p}?width=1280&height=720&nologo=true&seed=${seed}`,
            8000
          );
        })
      );
      extras.forEach((img) => { if (img) bgImages.push(img); });
      console.log(`[VideoExporter] ${bgImages.length} 張圖片準備完成`);

      // 2. 載入音訊
      setTimeInfo("準備音訊...");
      const audio = new Audio();
      audio.crossOrigin = "anonymous";
      audio.src = audioUrl;
      await new Promise<void>((resolve) => {
        audio.oncanplaythrough = () => resolve();
        audio.load();
      });

      const duration = audio.duration;
      if (!duration || duration <= 0) throw new Error("無法讀取音訊長度");

      // 3. 設定錄製
      const lyricLines = parseLyrics(lyrics, duration);
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d")!;
      const canvasStream = canvas.captureStream(24);
      const SWITCH_SEC = 10;
      const FADE_SEC = 2;

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

      const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 1500000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      // 4. 繪圖函式（含多圖 crossfade）
      const drawCoverFit = (img: HTMLImageElement, alpha: number) => {
        ctx.globalAlpha = alpha;
        const ir = img.width / img.height;
        const cr = canvas.width / canvas.height;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (ir > cr) { sw = img.height * cr; sx = (img.width - sw) / 2; }
        else { sh = img.width / cr; sy = (img.height - sh) / 2; }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
      };

      const drawFrame = (t: number) => {
        // 背景圖輪播 + crossfade
        const n = bgImages.length;
        if (n === 1) {
          drawCoverFit(bgImages[0], 1);
        } else {
          const slot = t % (SWITCH_SEC * n);
          const idx = Math.floor(slot / SWITCH_SEC);
          const nextIdx = (idx + 1) % n;
          const inSlot = slot - idx * SWITCH_SEC;

          drawCoverFit(bgImages[idx], 1);
          if (inSlot >= SWITCH_SEC - FADE_SEC) {
            const fade = (inSlot - (SWITCH_SEC - FADE_SEC)) / FADE_SEC;
            drawCoverFit(bgImages[nextIdx], fade);
          }
        }

        // 暗化 + 漸層
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const tg = ctx.createLinearGradient(0, 0, 0, 120);
        tg.addColorStop(0, "rgba(0,0,0,0.6)"); tg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = tg; ctx.fillRect(0, 0, canvas.width, 120);
        const bg = ctx.createLinearGradient(0, canvas.height - 150, 0, canvas.height);
        bg.addColorStop(0, "rgba(0,0,0,0)"); bg.addColorStop(1, "rgba(0,0,0,0.8)");
        ctx.fillStyle = bg; ctx.fillRect(0, canvas.height - 150, canvas.width, 150);

        // 標題
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = "bold 28px sans-serif";
        ctx.fillText(title, canvas.width / 2, 50);

        // 歌詞
        const { current, visible } = getVisibleLines(lyricLines, t, 7);
        const centerY = canvas.height / 2;
        const lineH = 52;
        const startY = centerY - ((visible.length - 1) / 2) * lineH;
        visible.forEach((line, i) => {
          if (line.type === "empty") return;
          const y = startY + i * lineH;
          const isCur = line.id === current?.id;
          ctx.font = isCur ? "bold 36px sans-serif" : "24px sans-serif";
          ctx.fillStyle = isCur ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.45)";
          ctx.shadowColor = isCur ? "rgba(92,124,250,0.8)" : "transparent";
          ctx.shadowBlur = isCur ? 20 : 0;
          ctx.fillText(line.text, canvas.width / 2, y);
          ctx.shadowBlur = 0;
        });

        // 進度條
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fillRect(0, canvas.height - 10, canvas.width, 6);
        ctx.fillStyle = "rgba(92,124,250,0.9)";
        ctx.fillRect(0, canvas.height - 10, canvas.width * (t / duration), 6);
      };

      // 5. 開始錄製
      setTimeInfo("錄製中...");
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = async () => {
          if (done) return;
          done = true;
          const blob = new Blob(chunks, { type: mimeType });
          if (blob.size === 0) { setExporting(false); resolve(); return; }

          // WebM → MP4 轉檔（瀏覽器內完成，不需伺服器）
          if (mimeType.includes("webm")) {
            setTimeInfo("載入轉檔工具中...");
            try {
              const { FFmpeg } = await import("@ffmpeg/ffmpeg");
              const { fetchFile } = await import("@ffmpeg/util");
              const ffmpeg = new FFmpeg();
              await ffmpeg.load({
                coreURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js",
                wasmURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm",
              });
              setTimeInfo("轉檔為 MP4 中...");
              await ffmpeg.writeFile("input.webm", await fetchFile(blob));
              await ffmpeg.exec([
                "-i", "input.webm",
                "-c:v", "libx264",
                "-crf", "23",
                "-preset", "fast",
                "-c:a", "aac",
                "-b:a", "128k",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                "-y", "output.mp4",
              ]);
              const data = await ffmpeg.readFile("output.mp4");
              const mp4Blob = new Blob([new Uint8Array(data as Uint8Array)], { type: "video/mp4" });
              await downloadOrShare(mp4Blob, `${title}.mp4`);
            } catch (e) {
              console.error("[ffmpeg.wasm 轉檔失敗]", e);
              alert("MP4 轉檔失敗，先下載 WebM 格式");
              await downloadOrShare(blob, `${title}.webm`);
            }
          } else {
            await downloadOrShare(blob, `${title}.mp4`);
          }
          setExporting(false);
          setProgress(100);
          setTimeInfo("");
          resolve();
        };

        recorder.onstop = finish;

        recorder.start(200);
        audio.currentTime = 0;
        audio.play();

        let animStopped = false;
        const stopRecording = () => {
          if (animStopped) return;
          animStopped = true;
          audio.pause();
          drawFrame(audio.currentTime);
          try { recorder.requestData(); } catch {}
          // 立即停止
          try {
            if (recorder.state === "recording") recorder.stop();
          } catch {
            finish();
          }
        };

        const animate = () => {
          if (animStopped) return;
          if (stopRef.current) {
            stopRecording();
            return;
          }
          const t = audio.currentTime;
          const rem = Math.max(0, Math.ceil(duration - t));
          setProgress(Math.round((t / duration) * 100));
          setTimeInfo(`剩餘 ${Math.floor(rem / 60)}:${(rem % 60).toString().padStart(2, "0")}`);
          drawFrame(t);
          if (t < duration && !audio.ended) {
            requestAnimationFrame(animate);
          } else {
            stopRecording();
          }
        };
        animate();

        // 備用：監聽音訊結束事件
        audio.onended = () => stopRecording();
      });
    } catch (err) {
      console.error("[VideoExporter]", err);
      alert("影片匯出失敗：" + (err instanceof Error ? err.message : "未知錯誤"));
      setExporting(false);
      setTimeInfo("");
    }
  }, [imageUrl, audioUrl, lyrics, title]);

  const stopAndDownload = () => {
    stopRef.current = true;
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
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={stopAndDownload}
                  className="btn-primary bg-orange-600 hover:bg-orange-500 py-3 px-5 whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  停止並下載
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
                  <span className="text-sm text-gray-400 tabular-nums whitespace-nowrap">
                    {progress}% {timeInfo}
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-500">錄製中...隨時可按「停止並下載」，錄到哪就下載到哪</p>
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
        <div>
          {creatingVideo ? (
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-green-400 animate-spin" />
              <span className="text-sm text-gray-300">{timeInfo || "合成影片中..."}</span>
            </div>
          ) : (
            <button onClick={createClientVideo} className="btn-primary py-3 px-5 bg-green-600 hover:bg-green-500">
              <Film className="w-5 h-5" />
              合成 MP4 影片（可分享 FB）
            </button>
          )}
        </div>
      )}
    </div>
  );
}
