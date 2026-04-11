/**
 * AI 歌曲生成整合模組
 *
 * 優先順序：
 *   1. ACE Music（acemusic.ai）
 *   2. DiffRhythm2（HF Space，免費開源，需 HF_TOKEN）
 *   3. Suno API (sunoapi.org)
 *
 * 環境變數：
 *   ACE_MUSIC_API_KEY  - 從 acemusic.ai/playground/api-key 免費取得
 *   HF_TOKEN           - 從 huggingface.co/settings/tokens 免費取得
 *   SUNO_API_KEY       - 從 sunoapi.org 獲取（付費服務）
 */

const ACE_MUSIC_API_KEY = process.env.ACE_MUSIC_API_KEY || "";
const ACE_BASE_URL = "https://api.acemusic.ai";
const HF_TOKEN = process.env.HF_TOKEN || "";
const DIFFRHYTHM2_URL = "https://aslp-lab-diffrhythm2.hf.space";
const SUNO_API_KEY = process.env.SUNO_API_KEY || "";

export interface SunoGenerateParams {
  lyrics: string;
  title: string;
  style: string;
  instrumental?: boolean;
}

/**
 * 檢查是否有任何 AI 音樂 API 可用
 */
export function isSunoConfigured(): boolean {
  return !!(ACE_MUSIC_API_KEY || HF_TOKEN || SUNO_API_KEY);
}

// ===== Suno API (sunoapi.org) =====

async function generateWithSunoAPI(params: SunoGenerateParams): Promise<string> {
  if (!SUNO_API_KEY) throw new Error("SUNO_API_KEY 未設定");

  console.log("[Suno API] 開始生成歌曲:", params.title);

  // 組合 prompt：風格 + 歌詞（要求 2-3 分鐘的完整歌曲）
  const prompt = `${params.style}. Title: ${params.title}. Full song structure: intro, verse 1, chorus, verse 2, chorus, bridge, final chorus, outro. Target duration: 2-3 minutes.\nLyrics:\n${params.lyrics}`;

  // Step 1: 提交生成任務
  const submitRes = await fetch("https://api.sunoapi.org/api/v1/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUNO_API_KEY}`,
    },
    body: JSON.stringify({
      prompt,
      customMode: false,
      instrumental: params.instrumental || false,
      model: "V4_5ALL",
      callBackUrl: "https://example.com/callback", // 必須提供非空 URL
    }),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    console.error("[Suno API] 提交失敗:", errText);
    throw new Error(`Suno API 提交失敗: ${submitRes.status}`);
  }

  const submitData = await submitRes.json();
  const taskId = submitData?.data?.taskId;
  if (!taskId) throw new Error("Suno API 未返回 taskId");

  console.log("[Suno API] taskId:", taskId);

  // Step 2: 輪詢任務狀態（最多 120 秒）
  const maxAttempts = 24; // 120 秒 / 5 秒
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const statusRes = await fetch(
      `https://api.sunoapi.org/api/v1/generate/record-info?taskId=${taskId}`,
      {
        headers: {
          Authorization: `Bearer ${SUNO_API_KEY}`,
        },
      }
    );

    if (!statusRes.ok) {
      console.error("[Suno API] 狀態查詢失敗:", statusRes.status);
      continue;
    }

    const statusData = await statusRes.json();
    const status = statusData?.data?.status;

    console.log(`[Suno API] 狀態 (${i + 1}/${maxAttempts}):`, status);

    if (status === "SUCCESS" || status === "TEXT_SUCCESS") {
      // 嘗試多種可能的音訊 URL 欄位
      const audioUrl =
        statusData?.data?.response?.sunoData?.[0]?.streamAudioUrl ||
        statusData?.data?.response?.sunoData?.[0]?.audioUrl ||
        statusData?.data?.response?.data?.[0]?.audio_url ||
        statusData?.data?.response?.data?.[0]?.streamAudioUrl;

      if (audioUrl) {
        console.log("[Suno API] 生成完成:", audioUrl.slice(0, 80));
        return audioUrl;
      }
      console.error("[Suno API] 回應格式:", JSON.stringify(statusData?.data?.response, null, 2));
      throw new Error("Suno API 成功但未返回音訊 URL");
    }

    if (status === "FAILED") {
      throw new Error("Suno API 生成失敗");
    }
  }

  throw new Error("Suno API 生成超時");
}

// ===== ACE Music =====

async function generateWithACE(params: SunoGenerateParams): Promise<string> {
  if (!ACE_MUSIC_API_KEY) throw new Error("ACE_MUSIC_API_KEY 未設定");

  console.log("[ACE Music] 開始生成歌曲:", params.title);

  const prompt = params.instrumental
    ? `Generate an instrumental track. Style: ${params.style}. Title: ${params.title}`
    : `Style: ${params.style}. Title: ${params.title}.\nLyrics:\n${params.lyrics}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  let res: Response;
  try {
    res = await fetch(`${ACE_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ACE_MUSIC_API_KEY}`,
      },
      body: JSON.stringify({
        model: "acemusic/acestep-v1.5-turbo",
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errText = await res.text();
    console.error("[ACE Music] 請求失敗:", errText);
    throw new Error(`ACE Music 失敗: ${res.status}`);
  }

  const data = await res.json();
  const audioArr = data?.choices?.[0]?.message?.audio;
  if (audioArr?.[0]) {
    const audioUrl = audioArr[0].audio_url?.url || audioArr[0].audio_url;
    if (audioUrl) {
      console.log("[ACE Music] 生成完成");
      return audioUrl;
    }
  }
  throw new Error("ACE Music 回傳格式異常");
}

// ===== DiffRhythm2 (HF Space) =====

async function singleDiffRhythm2Call(formattedLyrics: string, stylePrompt: string): Promise<string> {
  // Step 1: 提交任務（API 需要 10 個參數）
  const submitRes = await fetch(`${DIFFRHYTHM2_URL}/gradio_api/call/infer_music`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${HF_TOKEN}`,
    },
    body: JSON.stringify({
      data: [formattedLyrics, "", null, stylePrompt, 0, true, 16, 1.3, "mp3", "euler"],
    }),
  });

  if (!submitRes.ok) throw new Error("DiffRhythm2 提交失敗");

  const { event_id } = await submitRes.json();
  console.log("[DiffRhythm2] event_id:", event_id);

  // Step 2: SSE 取得結果（50 秒超時）
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 50000);

  try {
    const resultRes = await fetch(
      `${DIFFRHYTHM2_URL}/gradio_api/call/infer_music/${event_id}`,
      { signal: ctrl.signal, headers: { Authorization: `Bearer ${HF_TOKEN}` } }
    );

    if (!resultRes.ok) throw new Error("結果取得失敗");

    const text = await resultRes.text();

    if (text.includes("event: error")) {
      throw new Error("GPU 不可用");
    }

    const dataLines = text.split("\n").filter(
      (l) => l.startsWith("data: ") && !l.includes("data: null")
    );
    if (dataLines.length === 0) throw new Error("無資料回傳");

    const lastData = dataLines[dataLines.length - 1].replace("data: ", "").trim();
    const parsed = JSON.parse(lastData);
    const audioUrl = parsed?.[0]?.url || parsed?.[0]?.path;

    if (!audioUrl) throw new Error("未取得音訊 URL");

    return audioUrl.startsWith("http")
      ? audioUrl
      : `${DIFFRHYTHM2_URL}/gradio_api/file=${audioUrl}`;
  } finally {
    clearTimeout(timer);
  }
}

async function generateWithDiffRhythm2(params: SunoGenerateParams): Promise<string> {
  if (!HF_TOKEN) throw new Error("HF_TOKEN 未設定");

  console.log("[DiffRhythm2] 開始生成歌曲:", params.title);

  // DiffRhythm2 要求小寫 section 標記
  const lyricsWithLowerTags = params.lyrics.replace(
    /\[([A-Za-z\s]+)\]/g,
    (_, tag) => `[${tag.toLowerCase().trim()}]`
  );
  const lyricsLines = lyricsWithLowerTags.split("\n").filter(l => l.trim());
  const formattedLyrics = lyricsLines.some(l => l.trim().startsWith("["))
    ? (lyricsWithLowerTags.trim().startsWith("[start]") ? lyricsWithLowerTags : `[start]\n${lyricsWithLowerTags}`)
    : `[start]\n[verse]\n${lyricsLines.join("\n")}`;
  const stylePrompt = params.style || "pop, mandarin, emotional, catchy melody";

  // 最多重試 2 次（HF Space GPU 可能暫時不可用）
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const url = await singleDiffRhythm2Call(formattedLyrics, stylePrompt);
      console.log("[DiffRhythm2] 生成完成（第 %d 次）", attempt);
      return url;
    } catch (err) {
      console.warn(`[DiffRhythm2] 第 ${attempt} 次失敗:`, (err as Error).message);
      if (attempt < 2) {
        console.log("[DiffRhythm2] 等待 3 秒後重試...");
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }
  throw new Error("DiffRhythm2 多次嘗試均失敗（GPU 可能暫時不可用）");
}

// ===== 主入口：ACE Music → DiffRhythm2 → Suno API =====

export async function generateSong(params: SunoGenerateParams): Promise<string> {
  // 1. 優先 ACE Music
  if (ACE_MUSIC_API_KEY) {
    try {
      return await generateWithACE(params);
    } catch (err) {
      console.warn("[generateSong] ACE Music 失敗:", (err as Error).message);
    }
  }

  // 2. 備援 DiffRhythm2（免費、有歌聲）
  if (HF_TOKEN) {
    try {
      return await generateWithDiffRhythm2(params);
    } catch (err) {
      console.warn("[generateSong] DiffRhythm2 失敗:", (err as Error).message);
    }
  }

  // 3. 備援 Suno API（付費但穩定）
  if (SUNO_API_KEY) {
    try {
      return await generateWithSunoAPI(params);
    } catch (err) {
      console.warn("[generateSong] Suno API 失敗:", (err as Error).message);
    }
  }

  throw new Error("AI 歌聲服務暫時不可用，請稍後再試");
}
