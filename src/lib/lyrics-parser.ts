export interface LyricLine {
  id: number;
  text: string;
  startTime: number; // 秒
  endTime: number;   // 秒
  type: "title" | "section" | "lyric" | "empty";
}

/**
 * 將純文字歌詞解析成帶時間軸的字幕行
 * 忽略 LRC 時間戳，改為根據音樂長度自動分配時間
 */
export function parseLyrics(
  lyrics: string,
  totalDuration: number
): LyricLine[] {
  const rawLines = lyrics.split("\n");
  const lines: LyricLine[] = [];

  console.log('[parseLyrics] totalDuration:', totalDuration);
  console.log('[parseLyrics] rawLines count:', rawLines.length);
  console.log('[parseLyrics] lyrics preview:', lyrics.substring(0, 200));

  // 解析歌詞，移除 LRC 時間戳和段落標記
  const parsed: Array<{ text: string; type: LyricLine["type"] }> = [];
  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      parsed.push({ text: "", type: "empty" });
    } else {
      // 移除 LRC 時間戳
      let text = trimmed.replace(/^\[\d{2}:\d{2}\.\d{2}\]/, '').trim();
      // 移除段落標記（如 [Verse 1], [Chorus]）
      text = text.replace(/^\[.*?\]$/, '').trim();
      // 移除標題標記
      if (text.startsWith("【") || text.startsWith("作詞") || text.startsWith("作曲")) {
        parsed.push({ text: "", type: "empty" });
      } else if (text) {
        parsed.push({ text, type: "lyric" });
      } else {
        parsed.push({ text: "", type: "empty" });
      }
    }
  }

  // 計算有效行數（非空行），用於分配時間
  const effectiveLines = parsed.filter((l) => l.type === "lyric");
  const totalEffective = effectiveLines.length;

  console.log('[parseLyrics] effectiveLines count:', totalEffective);

  if (totalEffective === 0) return [];

  // 每行佔用的基本時間（限制最大 5 秒，避免字幕不動）
  const timePerLine = Math.min(totalDuration / totalEffective, 5);

  console.log('[parseLyrics] timePerLine:', timePerLine);

  let currentTime = 0;
  let id = 0;

  for (const item of parsed) {
    if (item.type === "lyric") {
      const duration = timePerLine;
      lines.push({
        id: id++,
        text: item.text,
        startTime: currentTime,
        endTime: currentTime + duration,
        type: "lyric",
      });
      currentTime += duration;
    }
  }

  console.log('[parseLyrics] parsed lines count:', lines.length);
  return lines;
}

/**
 * 根據當前播放時間取得應顯示的歌詞行
 * 回傳當前行 + 前後各幾行用於顯示
 */
export function getVisibleLines(
  lines: LyricLine[],
  currentTime: number,
  visibleCount: number = 7
): { current: LyricLine | null; visible: LyricLine[]; currentIndex: number } {
  // 找到當前播放的行
  let currentIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (currentTime >= lines[i].startTime && currentTime < lines[i].endTime) {
      currentIndex = i;
      break;
    }
  }

  // 如果超過最後一行
  if (currentIndex === -1 && currentTime >= (lines[lines.length - 1]?.endTime ?? 0)) {
    currentIndex = lines.length - 1;
  }

  const current = currentIndex >= 0 ? lines[currentIndex] : null;

  console.log('[getVisibleLines] currentTime:', currentTime, 'currentIndex:', currentIndex, 'current text:', current?.text);

  // 計算可見範圍
  const half = Math.floor(visibleCount / 2);
  let start = Math.max(0, currentIndex - half);
  let end = Math.min(lines.length, start + visibleCount);

  // 調整起始位置
  if (end - start < visibleCount) {
    start = Math.max(0, end - visibleCount);
  }

  const visible = lines.slice(start, end);

  return { current, visible, currentIndex };
}

/**
 * 格式化時間為 mm:ss
 */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
