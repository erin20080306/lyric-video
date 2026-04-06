"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Loader2, Music, ImageIcon, Film } from "lucide-react";
import { parseLyrics } from "@/lib/lyrics-parser";

// ===== 後端 FFmpeg 伺服器 URL =====
const VIDEO_SERVER =
  process.env.NEXT_PUBLIC_VIDEO_SERVER_URL || "https://eron2008-lyric-video-server.hf.space";

interface VideoExporterProps {
  imageUrl: string;
  audioUrl: string;
  lyrics: string;
  title: string;
}

// ===== 工具函式 =====

/** base64 data URL → Blob */
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
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ title: filename, files: [file] });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}

/** 圖片縮放到 720p（1280×720）以內，回傳 Blob */
async function resizeImageTo720p(src: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const MAX_W = 1280, MAX_H = 720;
      let w = img.width, h = img.height;
      if (w > MAX_W || h > MAX_H) {
        const ratio = Math.min(MAX_W / w, MAX_H / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("圖片壓縮失敗"))),
        "image/jpeg",
        0.85
      );
    };
    img.onerror = () => reject(new Error("圖片載入失敗"));
    img.src = src;
  });
}

// ===== 素材快取 =====
const materialCache = new Map<string, { imageBlob: Blob; audioBlob: Blob }>();

function getCacheKey(imageUrl: string, audioUrl: string): string {
  return `${imageUrl.slice(0, 50)}_${audioUrl.slice(0, 50)}`;
}

// ===== 主元件 =====
export default function VideoExporter({
  imageUrl,
  audioUrl,
  lyrics,
  title,
}: VideoExporterProps) {
  const [exporting, setExporting] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [downloadingMp3, setDownloadingMp3] = useState(false);
  const [materialsReady, setMaterialsReady] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const imageBlobRef = useRef<Blob | null>(null);
  const audioBlobRef = useRef<Blob | null>(null);

  // ===== 素材預處理（進入頁面就開始，快取避免重複）=====
  useEffect(() => {
    const key = getCacheKey(imageUrl, audioUrl);
    const cached = materialCache.get(key);
    if (cached) {
      imageBlobRef.current = cached.imageBlob;
      audioBlobRef.current = cached.audioBlob;
      setMaterialsReady(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // 並行處理圖片縮放 + 音訊下載
        const [imgBlob, audioBlob] = await Promise.all([
          resizeImageTo720p(imageUrl),
          audioUrl.startsWith("data:")
            ? Promise.resolve(dataUrlToBlob(audioUrl))
            : fetch(audioUrl).then((r) => r.blob()),
        ]);
        if (cancelled) return;
        imageBlobRef.current = imgBlob;
        audioBlobRef.current = audioBlob;
        materialCache.set(key, { imageBlob: imgBlob, audioBlob: audioBlob });
        setMaterialsReady(true);
      } catch (e) {
        console.error("[素材預處理]", e);
      }
    })();
    return () => { cancelled = true; };
  }, [imageUrl, audioUrl]);

  // ===== 取得音訊長度 =====
  useEffect(() => {
    const audio = new Audio();
    audio.src = audioUrl;
    audio.addEventListener("loadedmetadata", () => {
      setAudioDuration(Math.min(audio.duration, 60));
    });
    audio.load();
  }, [audioUrl]);

  // ===== MP3 下載 =====
  const downloadAudio = useCallback(async () => {
    setDownloadingMp3(true);
    try {
      const blob: Blob = audioBlobRef.current ?? (
        audioUrl.startsWith("data:")
          ? dataUrlToBlob(audioUrl)
          : await fetch(audioUrl).then((r) => r.blob())
      );
      await downloadOrShare(
        blob.type.includes("audio") ? blob : new Blob([blob], { type: "audio/mpeg" }),
        `${title}.mp3`
      );
    } catch {
      alert("MP3 下載失敗");
    } finally {
      setDownloadingMp3(false);
    }
  }, [audioUrl, title]);

  // ===== 背景圖下載 =====
  const downloadImage = useCallback(() => {
    try {
      const blob = imageBlobRef.current || dataUrlToBlob(imageUrl);
      downloadOrShare(blob, `${title}-背景圖.jpg`);
    } catch {
      alert("圖片下載失敗");
    }
  }, [imageUrl, title]);

  // ===== 匯出 MP4（後端 FFmpeg）=====
  const exportMP4 = useCallback(async () => {
    if (!materialsReady || !imageBlobRef.current || !audioBlobRef.current) {
      alert("素材準備中，請稍候再試");
      return;
    }

    setExporting(true);
    setStatusText("準備素材中...");

    try {
      // 1. 解析歌詞時間軸
      const duration = audioDuration || 60;
      const lyricLines = parseLyrics(lyrics, duration).map((l) => ({
        text: l.text,
        startTime: l.startTime,
        endTime: l.endTime,
        type: l.type,
      }));

      // 2. 組裝 FormData
      setStatusText("上傳素材到伺服器...");
      const form = new FormData();
      form.append("image", imageBlobRef.current, "image.jpg");
      form.append("audio", audioBlobRef.current, "audio.mp3");
      form.append("title", title);
      form.append("lyrics", JSON.stringify(lyricLines));
      form.append("duration", String(duration));

      // 3. 送出到後端 FFmpeg
      setStatusText("伺服器合成 MP4 中（約 10-30 秒）...");
      const res = await fetch(`${VIDEO_SERVER}/api/create-video`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "伺服器錯誤" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      // 4. 下載/分享 MP4
      setStatusText("下載中...");
      const mp4Blob = await res.blob();
      await downloadOrShare(mp4Blob, `${title}.mp4`);
      setStatusText("");
    } catch (err) {
      console.error("[匯出MP4]", err);
      const msg = err instanceof Error ? err.message : "未知錯誤";
      alert(`MP4 匯出失敗：${msg}\n\n可先下載 MP3 + 背景圖，用剪映合成`);
      setStatusText("");
    } finally {
      setExporting(false);
    }
  }, [materialsReady, audioDuration, lyrics, title]);

  return (
    <div className="space-y-4">
      {/* MP3 + 背景圖下載 */}
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

      {/* 匯出 MP4 影片 - 所有裝置統一走後端 */}
      {exporting ? (
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-green-400 animate-spin" />
          <span className="text-sm text-gray-300">{statusText}</span>
        </div>
      ) : (
        <button
          onClick={exportMP4}
          disabled={!materialsReady}
          className="btn-primary py-3 px-5 bg-green-600 hover:bg-green-500 disabled:opacity-50"
        >
          <Film className="w-5 h-5" />
          {materialsReady ? "匯出 MP4 影片（含歌詞字幕）" : "素材準備中..."}
        </button>
      )}

      <p className="text-xs text-gray-500">
        MP4 由伺服器合成，iPhone / Android / 電腦都能直接播放分享
      </p>
    </div>
  );
}
