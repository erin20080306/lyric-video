export interface LyricLine {
  id: number;
  text: string;
  startTime: number; // 秒
  endTime: number;   // 秒
  type: "title" | "section" | "lyric" | "empty";
}

/**
 * 將純文字歌詞解析成帶時間軸的字幕行
 * 支援 LRC 格式（[00:00.00] 時間戳），如果沒有時間戳則自動分配
 */
export function parseLyrics(
  lyrics: string,
  totalDuration: number
): LyricLine[] {
  const rawLines = lyrics.split("\n");
  const lines: LyricLine[] = [];

  // 檢查是否為 LRC 格式（包含時間戳）
  const hasLrcTimestamp = rawLines.some(line => /^\[\d{2}:\d{2}\.\d{2}\]/.test(line));

  if (hasLrcTimestamp) {
    // 解析 LRC 格式
    let id = 0;
    for (const raw of rawLines) {
      const trimmed = raw.trim();
      if (!trimmed) continue;

      // 解析時間戳 [00:00.00]
      const timeMatch = trimmed.match(/^\[(\d{2}):(\d{2})\.(\d{2})\](.*)$/);
      if (timeMatch) {
        const minutes = parseInt(timeMatch[1], 10);
        const seconds = parseInt(timeMatch[2], 10);
        const centiseconds = parseInt(timeMatch[3], 10);
        const startTime = minutes * 60 + seconds + centiseconds / 100;
        const text = timeMatch[4].trim();

        // 判斷類型
        let type: LyricLine["type"] = "lyric";
        if (text.startsWith("【") || text.startsWith("作詞") || text.startsWith("作曲")) {
          type = "title";
        } else if (text.startsWith("[") && text.endsWith("]")) {
          type = "section";
        } else if (!text) {
          type = "empty";
        }

        lines.push({
          id: id++,
          text,
          startTime,
          endTime: startTime + 3, // 預設每行 3 秒，後續會調整
          type,
        });
      }
    }

    // 調整 endTime（基於下一行的 startTime）
    for (let i = 0; i < lines.length - 1; i++) {
      lines[i].endTime = lines[i + 1].startTime;
    }
    // 最後一行延長到總長度
    if (lines.length > 0) {
      lines[lines.length - 1].endTime = Math.max(totalDuration, lines[lines.length - 1].startTime + 3);
    }

    return lines;
  }

  // 沒有時間戳，使用自動分配邏輯
  const parsed: Array<{ text: string; type: LyricLine["type"] }> = [];
  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      parsed.push({ text: "", type: "empty" });
    } else if (trimmed.startsWith("【") || trimmed.startsWith("作詞") || trimmed.startsWith("作曲")) {
      parsed.push({ text: trimmed, type: "title" });
    } else if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      parsed.push({ text: trimmed, type: "section" });
    } else {
      parsed.push({ text: trimmed, type: "lyric" });
    }
  }

  // 計算有效行數（非空行），用於分配時間
  const effectiveLines = parsed.filter((l) => l.type !== "empty");
  const totalEffective = effectiveLines.length;

  if (totalEffective === 0) return [];

  // 每行佔用的基本時間
  const timePerLine = totalDuration / totalEffective;

  // 不同類型行的時間權重
  const getWeight = (type: LyricLine["type"]): number => {
    switch (type) {
      case "title": return 1.5;
      case "section": return 1.2;
      case "lyric": return 1.0;
      case "empty": return 0.3;
      default: return 1.0;
    }
  };

  // 計算加權總和
  const totalWeight = parsed.reduce((sum, l) => sum + getWeight(l.type), 0);
  const timePerWeight = totalDuration / totalWeight;

  let currentTime = 0;
  let id = 0;

  for (const item of parsed) {
    const weight = getWeight(item.type);
    const duration = timePerWeight * weight;

    lines.push({
      id: id++,
      text: item.text,
      startTime: currentTime,
      endTime: currentTime + duration,
      type: item.type,
    });

    currentTime += duration;
  }

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
