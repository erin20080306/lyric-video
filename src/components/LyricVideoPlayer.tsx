"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  SkipBack,
} from "lucide-react";
import { parseLyrics, getVisibleLines, formatTime } from "@/lib/lyrics-parser";
import type { LyricLine } from "@/lib/lyrics-parser";

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

interface LyricVideoPlayerProps {
  imageUrl: string;
  imageUrls?: string[];
  audioUrl: string;
  lyrics: string;
  title: string;
}

export default function LyricVideoPlayer({
  imageUrl,
  imageUrls,
  audioUrl,
  lyrics,
  title,
}: LyricVideoPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [lyricLines, setLyricLines] = useState<LyricLine[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [allImages, setAllImages] = useState<string[]>([]);

  // 初始化圖片
  useEffect(() => {
    // 如果沒有圖片，使用默認 fallback
    const defaultFallback = makeSvgFallback(title || "Music", "#667eea", "#764ba2");
    const initial = imageUrls && imageUrls.length > 1 ? imageUrls : (imageUrl ? [imageUrl] : [defaultFallback]);
    setAllImages(initial);
    setCurrentImageIndex(0);
    console.log('[LyricVideoPlayer] 初始化圖片:', initial.length, '張');
  }, [imageUrl, imageUrls, title]);

  // 播放後才背景載入額外圖片（不拖慢初始載入）
  const extraLoaded = useRef(false);
  useEffect(() => {
    if (!isPlaying || extraLoaded.current || allImages.length > 1) return;
    extraLoaded.current = true;

    const styles = [
      "watercolor painting, soft gradients",
      "fantasy landscape, magical lighting",
    ];
    styles.forEach((style) => {
      const seed = Math.floor(Math.random() * 999999);
      const prompt = encodeURIComponent(`${style}, ${title}, no text, 4k`);
      const url = `https://image.pollinations.ai/prompt/${prompt}?width=1280&height=720&nologo=true&seed=${seed}`;
      const img = new Image();
      img.onload = () => setAllImages((prev) => [...prev, url]);
      img.src = url;
    });
  }, [isPlaying, title, allImages.length]);

  // 圖片輪播（每 10 秒切換）
  useEffect(() => {
    if (allImages.length <= 1 || !isPlaying) return;
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % allImages.length);
    }, 10000);
    return () => clearInterval(interval);
  }, [allImages.length, isPlaying]);

  // 解析歌詞
  useEffect(() => {
    if (lyrics && duration > 0) {
      const lines = parseLyrics(lyrics, duration);
      setLyricLines(lines);
    }
  }, [lyrics, duration]);

  // 使用 requestAnimationFrame 平滑更新時間
  const updateTime = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updateTime);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updateTime);
    }
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, updateTime]);

  // 自動隱藏控制列
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying && showControls) {
      timer = setTimeout(() => setShowControls(false), 3000);
    }
    return () => clearTimeout(timer);
  }, [isPlaying, showControls]);

  // 全螢幕切換
  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (e) {
      console.log("全螢幕不支援");
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const restart = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    setCurrentTime(0);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    const newTime = ratio * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // 取得可見的歌詞行
  const { current, visible, currentIndex } = getVisibleLines(
    lyricLines,
    currentTime,
    9
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-2xl bg-black select-none group ${
        isFullscreen ? "rounded-none" : ""
      }`}
      onMouseMove={() => setShowControls(true)}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onClick={(e) => {
        // 點擊播放器區域（非控制列）切換播放
        if ((e.target as HTMLElement).closest("[data-controls]")) return;
        togglePlay();
      }}
    >
      {/* 隱藏的音頻元素 */}
      <audio
        ref={audioRef}
        src={audioUrl}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        preload="auto"
      />

      {/* 影片區域：背景圖 + 歌詞字幕 */}
      <div
        className={`relative w-full ${
          isFullscreen ? "h-screen" : "aspect-video"
        }`}
      >
        {/* 背景圖輪播 */}
        <div className="absolute inset-0">
          {allImages.map((src: string, i: number) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt="背景"
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-[2000ms] ease-in-out"
              style={{
                opacity: i === currentImageIndex ? 1 : 0,
                transform: i === currentImageIndex ? "scale(1.05)" : "scale(1)",
                transition: "opacity 2s ease-in-out, transform 10s ease-in-out",
              }}
            />
          ))}
          {/* 暗化背景讓字幕更清晰 */}
          <div className="absolute inset-0 bg-black/40" />
          {/* 上方漸層 */}
          <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/60 to-transparent" />
          {/* 下方漸層 */}
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black/80 to-transparent" />
        </div>

        {/* 標題區 */}
        <div className="absolute top-4 left-0 right-0 text-center z-10">
          <h2
            className={`font-bold text-white/80 transition-all duration-500 ${
              isFullscreen ? "text-2xl" : "text-base sm:text-lg"
            }`}
          >
            {title}
          </h2>
        </div>

        {/* 歌詞字幕區 - 居中顯示 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
          <div
            className={`flex flex-col items-center gap-1 sm:gap-2 transition-all duration-300 ${
              isFullscreen ? "gap-3" : ""
            }`}
          >
            {visible.map((line) => {
              const isCurrent = line.id === current?.id;
              const isPast =
                currentIndex >= 0 && line.id < (current?.id ?? 0);
              const isSection = line.type === "section";
              const isTitle = line.type === "title";
              const isEmpty = line.type === "empty";

              if (isEmpty) {
                return <div key={line.id} className="h-2 sm:h-4" />;
              }

              return (
                <div
                  key={line.id}
                  className={`text-center transition-all duration-500 ease-out px-4 ${
                    isFullscreen ? "max-w-4xl" : "max-w-2xl"
                  } ${
                    isCurrent
                      ? `scale-110 ${
                          isFullscreen
                            ? "text-2xl sm:text-3xl"
                            : "text-base sm:text-xl"
                        }`
                      : isPast
                      ? `opacity-30 ${
                          isFullscreen ? "text-lg sm:text-xl" : "text-xs sm:text-sm"
                        }`
                      : `opacity-50 ${
                          isFullscreen ? "text-lg sm:text-xl" : "text-xs sm:text-sm"
                        }`
                  }`}
                >
                  <span
                    className={`inline-block transition-all duration-500 ${
                      isCurrent
                        ? "text-white font-bold drop-shadow-[0_0_20px_rgba(92,124,250,0.8)] drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
                        : isSection
                        ? "text-primary-300/60 font-medium italic"
                        : isTitle
                        ? "text-white/40 font-light"
                        : "text-white/60 font-normal"
                    } ${
                      isCurrent
                        ? "animate-pulse-slow"
                        : ""
                    }`}
                  >
                    {line.text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 播放/暫停大按鈕 (中央) */}
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shadow-2xl">
              <Play className="w-8 h-8 sm:w-10 sm:h-10 text-white ml-1" />
            </div>
          </div>
        )}

        {/* 控制列 */}
        <div
          data-controls
          className={`absolute bottom-0 left-0 right-0 z-30 transition-all duration-300 ${
            showControls || !isPlaying
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4"
          }`}
        >
          {/* 進度條 */}
          <div
            className="w-full h-1.5 bg-white/20 cursor-pointer group/progress hover:h-3 transition-all duration-200"
            onClick={(e) => {
              e.stopPropagation();
              handleSeek(e);
            }}
          >
            <div
              className="h-full bg-gradient-to-r from-primary-500 to-purple-500 relative transition-all duration-100"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover/progress:opacity-100 transition-opacity" />
            </div>
          </div>

          {/* 控制按鈕列 */}
          <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-3 bg-gradient-to-t from-black/90 to-black/60">
            <div className="flex items-center gap-2 sm:gap-3">
              {/* 重新開始 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  restart();
                }}
                className="text-white/70 hover:text-white transition-colors p-1"
              >
                <SkipBack className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              {/* 播放/暫停 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className="text-white hover:text-primary-300 transition-colors p-1"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 sm:w-6 sm:h-6" />
                ) : (
                  <Play className="w-5 h-5 sm:w-6 sm:h-6 ml-0.5" />
                )}
              </button>
              {/* 音量 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute();
                }}
                className="text-white/70 hover:text-white transition-colors p-1"
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : (
                  <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
              </button>
              {/* 時間 */}
              <span className="text-white/60 text-xs sm:text-sm font-mono tabular-nums">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {/* 歌曲名稱 */}
              <span className="text-white/40 text-xs hidden sm:block truncate max-w-[200px]">
                {title}
              </span>
              {/* 全螢幕 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFullscreen();
                }}
                className="text-white/70 hover:text-white transition-colors p-1"
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : (
                  <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
