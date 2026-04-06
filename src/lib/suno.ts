/**
 * ACE Music — AI 歌曲生成整合模組（完全免費）
 *
 * 使用 ACE-Step 1.5 模型，透過 acemusic.ai 的 OpenAI 相容 API 生成有歌聲的歌曲。
 * 永久免費，無每日限制。
 *
 * 環境變數：
 *   ACE_MUSIC_API_KEY  - 從 acemusic.ai/playground/api-key 免費取得
 *
 * API：POST /v1/chat/completions（OpenAI 相容格式）
 */

const ACE_MUSIC_API_KEY = process.env.ACE_MUSIC_API_KEY || "";
const ACE_BASE_URL = "https://api.acemusic.ai";

export interface SunoGenerateParams {
  lyrics: string;
  title: string;
  style: string;
  instrumental?: boolean;
}

/**
 * 檢查 ACE Music API 是否已設定
 */
export function isSunoConfigured(): boolean {
  return !!ACE_MUSIC_API_KEY;
}

/**
 * 生成歌曲（含歌聲）— 回傳 data:audio/mpeg;base64,... 格式的 URL
 */
export async function generateSong(params: SunoGenerateParams): Promise<string> {
  if (!isSunoConfigured()) {
    throw new Error("ACE_MUSIC_API_KEY 未設定");
  }

  console.log("[ACE Music] 開始生成歌曲:", params.title);

  const prompt = params.instrumental
    ? `Generate an instrumental track. Style: ${params.style}. Title: ${params.title}`
    : `Style: ${params.style}. Title: ${params.title}.\nLyrics:\n${params.lyrics}`;

  const res = await fetch(`${ACE_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ACE_MUSIC_API_KEY}`,
    },
    body: JSON.stringify({
      model: "acemusic/acestep-v1.5-turbo",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[ACE Music] 生成請求失敗:", errText);
    throw new Error(`歌曲生成失敗: ${res.status}`);
  }

  const data = await res.json();
  const choice = data?.choices?.[0];
  const audioArr = choice?.message?.audio;

  if (audioArr?.[0]) {
    const audioUrl = audioArr[0].audio_url?.url || audioArr[0].audio_url;
    if (audioUrl) {
      console.log("[ACE Music] 歌曲生成完成, audio data length:", String(audioUrl).length);
      return audioUrl;
    }
  }

  console.error("[ACE Music] 回傳格式異常:", JSON.stringify(data).substring(0, 500));
  throw new Error("歌曲生成失敗：未取得音訊資料");
}
