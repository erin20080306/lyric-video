"use client";

import { useState, useEffect } from "react";
import {
  Sparkles,
  Music,
  Image as ImageIcon,
  FileText,
  Download,
  Loader2,
  CheckCircle2,
  Film,
  Package,
  AlertCircle,
} from "lucide-react";
import LyricVideoPlayer from "@/components/LyricVideoPlayer";
import type {
  GenerationResult,
  GenerationStep,
  LyricsResponse,
  ImageResponse,
  MusicResponse,
  ExportData,
} from "@/types";
import {
  downloadTextFile,
  downloadJsonFile,
  downloadDataUrl,
} from "@/lib/download";

const STEPS_CONFIG: Record<
  Exclude<GenerationStep, "idle" | "done" | "error">,
  { label: string; icon: typeof Sparkles }
> = {
  lyrics: { label: "生成歌詞 + 背景圖中...", icon: FileText },
  image: { label: "生成背景圖中...", icon: ImageIcon },
  music: { label: "AI 歌曲生成中...", icon: Music },
};

export default function Home() {
  const [theme, setTheme] = useState("");
  const [step, setStep] = useState<GenerationStep>("idle");
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string>("");
  const [apiMode, setApiMode] = useState<"loading" | "ai-vocal" | "mock-instrumental">("loading");

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => setApiMode(d.mode))
      .catch(() => setApiMode("mock-instrumental"));
  }, []);

  const handleGenerate = async () => {
    if (!theme.trim()) return;

    setStep("lyrics");
    setError("");
    setResult(null);

    try {
      const trimmed = theme.trim();

      // Step 1: 歌詞 + 圖片同時生成（圖片不需要歌詞）
      const lyricsPromise = fetch("/api/generate-lyrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: trimmed }),
      });
      const imagePromise = fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: trimmed }),
      });

      const [lyricsRes, imageRes] = await Promise.all([lyricsPromise, imagePromise]);

      if (!lyricsRes.ok) throw new Error("歌詞生成失敗");
      if (!imageRes.ok) throw new Error("背景圖生成失敗");

      const lyricsData: LyricsResponse = await lyricsRes.json();
      const imageData: ImageResponse = await imageRes.json();

      setStep("music");

      // Step 2: 生成音樂（需要歌詞）
      const musicRes = await fetch("/api/generate-music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: trimmed, lyrics: lyricsData.lyrics }),
      });
      if (!musicRes.ok) throw new Error("音樂生成失敗");
      const musicData: MusicResponse = await musicRes.json();

      setResult({
        lyrics: lyricsData.lyrics,
        title: lyricsData.title,
        imageUrl: imageData.imageUrl,
        audioUrl: musicData.audioUrl,
        theme: trimmed,
        createdAt: new Date().toISOString(),
      });
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成過程中發生錯誤");
      setStep("error");
    }
  };

  const handleDownloadLyrics = () => {
    if (!result) return;
    downloadTextFile(result.lyrics, "lyrics.txt");
  };

  const handleDownloadImage = async () => {
    if (!result) return;
    await downloadDataUrl(result.imageUrl, "background.png");
  };

  const handleDownloadAudio = async () => {
    if (!result) return;
    await downloadDataUrl(result.audioUrl, "song.mp3");
  };

  const handleDownloadProject = async () => {
    if (!result) return;
    const exportRes = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: result.title,
        theme: result.theme,
        lyrics: result.lyrics,
        imageUrl: result.imageUrl,
        audioUrl: result.audioUrl,
        createdAt: result.createdAt,
      } as ExportData),
    });
    const data = await exportRes.json();
    downloadJsonFile(data, "project.json");
  };

  const handleExportVideo = () => {
    alert("MP4 影片匯出功能即將推出，敬請期待！\n\n將使用 ffmpeg.wasm 在瀏覽器端合成：\n背景圖 + 歌聲 + 歌詞字幕 → MP4 影片");
  };

  const isGenerating = step !== "idle" && step !== "done" && step !== "error";

  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Background decorations */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-16">
        {/* Header */}
        <header className="text-center mb-10 sm:mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-300 text-sm mb-6">
            <Sparkles className="w-4 h-4" />
            <span>AI 驅動的音樂創作工具</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold bg-gradient-to-r from-white via-primary-200 to-purple-200 bg-clip-text text-transparent mb-4">
            AI 一鍵歌詞影片產生器
          </h1>
          <p className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto">
            輸入主題，自動生成背景圖、歌詞與歌曲。一鍵完成，即時預覽，輕鬆下載。
          </p>
        </header>

        {/* API Mode Banner */}
        {apiMode === "mock-instrumental" && (
          <div className="glass-card p-4 mb-8 border-yellow-500/20">
            <div className="flex items-start sm:items-center gap-3 text-yellow-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 sm:mt-0" />
              <div className="text-sm">
                <p className="font-medium">目前為展示模式（僅背景音樂，無 AI 歌聲）</p>
                <p className="text-yellow-400/60 mt-1">
                  如需生成真正有歌聲的 AI 歌曲，請到 <a href="https://acemusic.ai/playground/api-key" target="_blank" rel="noopener" className="underline hover:text-yellow-300">acemusic.ai</a> 免費註冊取得 API Key，
                  填入 <code className="px-1.5 py-0.5 bg-white/10 rounded text-xs">.env.local</code> 的 ACE_MUSIC_API_KEY。完全免費，無限制。
                </p>
              </div>
            </div>
          </div>
        )}
        {apiMode === "ai-vocal" && (
          <div className="glass-card p-4 mb-8 border-green-500/20">
            <div className="flex items-center gap-3 text-green-400">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-medium">ACE Music AI 歌聲已啟用 — 將生成真正有人聲演唱的歌曲（完全免費）</p>
            </div>
          </div>
        )}

        {/* Input Section */}
        <section className="glass-card p-6 sm:p-8 mb-8">
          <label
            htmlFor="theme-input"
            className="block text-sm font-medium text-gray-300 mb-3"
          >
            歌曲主題與需求
          </label>
          <textarea
            id="theme-input"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="例如：一首關於夏天海邊的浪漫情歌、適合在咖啡廳播放的輕柔爵士風..."
            className="input-field h-32 sm:h-36 text-base sm:text-lg"
            disabled={isGenerating}
          />
          <div className="flex items-center justify-between mt-5">
            <p className="text-xs text-gray-500">
              描述越詳細，生成結果越精準
            </p>
            <button
              onClick={handleGenerate}
              disabled={!theme.trim() || isGenerating}
              className="btn-primary text-base px-8 py-3.5"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  一鍵生成
                </>
              )}
            </button>
          </div>
        </section>

        {/* Progress Indicator */}
        {isGenerating && (
          <section className="glass-card p-6 mb-8">
            <div className="flex items-center gap-6">
              {(Object.keys(STEPS_CONFIG) as Array<keyof typeof STEPS_CONFIG>).map(
                (key, index) => {
                  const config = STEPS_CONFIG[key];
                  const Icon = config.icon;
                  const stepOrder = ["lyrics", "image", "music"];
                  const currentIndex = stepOrder.indexOf(step);
                  const thisIndex = stepOrder.indexOf(key);
                  const isActive = key === step;
                  const isDone = thisIndex < currentIndex;

                  return (
                    <div key={key} className="flex items-center gap-3 flex-1">
                      <div
                        className={`flex items-center justify-center w-10 h-10 rounded-full transition-all duration-500 ${
                          isActive
                            ? "bg-primary-500/20 text-primary-400 ring-2 ring-primary-500/50"
                            : isDone
                            ? "bg-green-500/20 text-green-400"
                            : "bg-white/5 text-gray-600"
                        }`}
                      >
                        {isDone ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : isActive ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Icon className="w-5 h-5" />
                        )}
                      </div>
                      <div className="hidden sm:block">
                        <p
                          className={`text-sm font-medium ${
                            isActive
                              ? "text-primary-300"
                              : isDone
                              ? "text-green-400"
                              : "text-gray-600"
                          }`}
                        >
                          {isDone ? "完成" : isActive ? config.label : config.label.replace("中...", "")}
                        </p>
                      </div>
                      {index < 2 && (
                        <div
                          className={`flex-1 h-px ${
                            isDone ? "bg-green-500/30" : "bg-white/10"
                          }`}
                        />
                      )}
                    </div>
                  );
                }
              )}
            </div>
          </section>
        )}

        {/* Error Message */}
        {step === "error" && (
          <section className="glass-card p-6 mb-8 border-red-500/30">
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          </section>
        )}

        {/* Results Section */}
        {result && step === "done" && (
          <section className="space-y-6 animate-in fade-in duration-700">
            {/* Success banner */}
            <div className="glass-card p-4 border-green-500/20">
              <div className="flex items-center gap-3 text-green-400">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                <p className="font-medium">
                  生成完成！「{result.title}」已準備就緒
                </p>
              </div>
            </div>

            {/* 歌詞影片播放器 */}
            <LyricVideoPlayer
              imageUrl={result.imageUrl}
              audioUrl={result.audioUrl}
              lyrics={result.lyrics}
              title={result.title}
            />

            {/* 歌詞全文 */}
            <div className="glass-card overflow-hidden">
              <div className="p-4 border-b border-white/10">
                <div className="flex items-center gap-2 text-gray-300">
                  <FileText className="w-4 h-4" />
                  <h3 className="font-medium">歌詞全文</h3>
                </div>
              </div>
              <div className="p-5 overflow-y-auto max-h-72">
                <pre className="whitespace-pre-wrap text-sm text-gray-300 font-sans leading-relaxed">
                  {result.lyrics}
                </pre>
              </div>
            </div>

            {/* Download Section */}
            <div className="glass-card p-6">
              <div className="flex items-center gap-2 text-gray-300 mb-5">
                <Download className="w-4 h-4" />
                <h3 className="font-medium">下載檔案</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <button onClick={handleDownloadLyrics} className="btn-secondary flex-col py-4">
                  <FileText className="w-5 h-5 text-blue-400" />
                  <span className="text-xs mt-1">lyrics.txt</span>
                </button>
                <button onClick={handleDownloadImage} className="btn-secondary flex-col py-4">
                  <ImageIcon className="w-5 h-5 text-green-400" />
                  <span className="text-xs mt-1">background.png</span>
                </button>
                <button onClick={handleDownloadAudio} className="btn-secondary flex-col py-4">
                  <Music className="w-5 h-5 text-purple-400" />
                  <span className="text-xs mt-1">song.mp3</span>
                </button>
                <button onClick={handleDownloadProject} className="btn-secondary flex-col py-4">
                  <Package className="w-5 h-5 text-yellow-400" />
                  <span className="text-xs mt-1">project.json</span>
                </button>
                <button
                  onClick={handleExportVideo}
                  className="btn-secondary flex-col py-4 opacity-60 hover:opacity-80 col-span-2 sm:col-span-1"
                >
                  <Film className="w-5 h-5 text-red-400" />
                  <span className="text-xs mt-1">MP4 影片</span>
                  <span className="text-[10px] text-gray-500">即將推出</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="mt-16 text-center text-gray-600 text-sm">
          <p>AI 一鍵歌詞影片產生器 &copy; {new Date().getFullYear()}</p>
          <p className="mt-1">Powered by Next.js &middot; 目前為 Mock 展示版本</p>
        </footer>
      </div>
    </main>
  );
}
