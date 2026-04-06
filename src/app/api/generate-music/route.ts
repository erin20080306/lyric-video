import { NextRequest, NextResponse } from "next/server";
import { isSunoConfigured, generateSong } from "@/lib/suno";

// Vercel serverless function timeout（免費版最多 60 秒）
export const maxDuration = 60;

// 音符頻率表 (Hz)
const NOTE: Record<string, number> = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 784.0,
};

// I-V-vi-IV 和弦進行（每組持續2拍 = 1秒 @120BPM）
const CHORD_PROGRESSION = [
  [NOTE.C4, NOTE.E4, NOTE.G4],       // C major
  [NOTE.G3, NOTE.B3, NOTE.D4],       // G major
  [NOTE.A3, NOTE.C4, NOTE.E4],       // A minor
  [NOTE.F3, NOTE.A3, NOTE.C4],       // F major
];

// 旋律音符序列（每個音0.5秒）
const MELODY_NOTES = [
  NOTE.E5, NOTE.D5, NOTE.C5, NOTE.D5,
  NOTE.E5, NOTE.E5, NOTE.E5, 0,
  NOTE.D5, NOTE.D5, NOTE.D5, 0,
  NOTE.E5, NOTE.G5, NOTE.G5, 0,
  NOTE.E5, NOTE.D5, NOTE.C5, NOTE.D5,
  NOTE.E5, NOTE.E5, NOTE.E5, NOTE.C5,
  NOTE.D5, NOTE.D5, NOTE.E5, NOTE.D5,
  NOTE.C5, NOTE.C5, 0, 0,
];

// 低音線（跟隨和弦根音，每個音1秒）
const BASS_NOTES = [
  NOTE.C3, NOTE.G3, NOTE.A3, NOTE.F3,
  NOTE.C3, NOTE.G3, NOTE.A3, NOTE.F3,
  NOTE.C3, NOTE.G3, NOTE.A3, NOTE.F3,
  NOTE.C3, NOTE.G3, NOTE.A3, NOTE.F3,
];

function generateSample(t: number, duration: number, sampleRate: number): number {
  let sample = 0;
  const bpm = 120;
  const beatDuration = 60 / bpm;

  // === 和弦墊音 (pad) ===
  const chordIndex = Math.floor((t / (beatDuration * 2)) % CHORD_PROGRESSION.length);
  const chord = CHORD_PROGRESSION[chordIndex];
  for (const freq of chord) {
    // 柔和的正弦波疊加
    sample += Math.sin(2 * Math.PI * freq * t) * 0.06;
    // 加一個八度上的泛音
    sample += Math.sin(2 * Math.PI * freq * 2 * t) * 0.015;
  }

  // === 旋律線 ===
  const melodyBeat = t / (beatDuration);
  const melodyIndex = Math.floor(melodyBeat) % MELODY_NOTES.length;
  const melodyFreq = MELODY_NOTES[melodyIndex];
  if (melodyFreq > 0) {
    // 每個音符的包絡線（attack + decay）
    const notePhase = melodyBeat - Math.floor(melodyBeat);
    const attack = Math.min(1, notePhase * 10); // 快速起音
    const decay = Math.max(0, 1 - notePhase * 1.5); // 自然衰減
    const melodyEnv = attack * (0.3 + decay * 0.7);
    // 正弦波 + 輕微鋸齒波使音色更飽滿
    const sine = Math.sin(2 * Math.PI * melodyFreq * t);
    const saw = 2 * ((melodyFreq * t) % 1) - 1;
    sample += (sine * 0.85 + saw * 0.15) * melodyEnv * 0.12;
  }

  // === 低音線 ===
  const bassIndex = Math.floor(t / (beatDuration * 2)) % BASS_NOTES.length;
  const bassFreq = BASS_NOTES[bassIndex];
  const bassPhase = (t / (beatDuration * 2)) - Math.floor(t / (beatDuration * 2));
  const bassEnv = Math.max(0, 1 - bassPhase * 0.8);
  sample += Math.sin(2 * Math.PI * bassFreq * t) * bassEnv * 0.10;

  // === 簡易鼓點 ===
  const beatPhase = (t / beatDuration) % 1;
  // Kick (每拍) - 低頻衰減
  if (beatPhase < 0.08) {
    const kickEnv = 1 - beatPhase / 0.08;
    sample += Math.sin(2 * Math.PI * 60 * t * (1 + kickEnv * 2)) * kickEnv * kickEnv * 0.15;
  }
  // Hi-hat (每半拍) - 噪音
  const halfBeatPhase = (t / (beatDuration * 0.5)) % 1;
  if (halfBeatPhase < 0.03) {
    const hhEnv = 1 - halfBeatPhase / 0.03;
    // 偽隨機噪音
    const noise = Math.sin(t * 13000) * Math.sin(t * 7919) * Math.sin(t * 3571);
    sample += noise * hhEnv * hhEnv * 0.04;
  }
  // Snare (第2、4拍)
  const barBeat = Math.floor((t / beatDuration) % 4);
  if ((barBeat === 1 || barBeat === 3) && beatPhase < 0.06) {
    const snareEnv = 1 - beatPhase / 0.06;
    const snareNoise = Math.sin(t * 8000) * Math.cos(t * 5000);
    sample += (snareNoise * 0.6 + Math.sin(2 * Math.PI * 200 * t) * 0.4) * snareEnv * snareEnv * 0.08;
  }

  // === 整體包絡（淡入淡出）===
  const fadeIn = Math.min(1, t / 1.0);            // 1 秒淡入
  const fadeOut = Math.min(1, (duration - t) / 2.0); // 2 秒淡出
  sample *= fadeIn * fadeOut;

  return sample;
}

export async function POST(request: NextRequest) {
  try {
    const { theme, lyrics } = await request.json();

    if (!theme || typeof theme !== "string") {
      return NextResponse.json(
        { error: "請提供音樂主題" },
        { status: 400 }
      );
    }

    // === 如果有設定 Suno API，使用真實 AI 生成歌聲 ===
    if (isSunoConfigured()) {
      try {
        const vocalStyles = [
          "pop, mandarin, female vocal, emotional, catchy melody",
          "pop, mandarin, male vocal, warm, catchy melody",
          "ballad, mandarin, female vocal, gentle, heartfelt",
          "ballad, mandarin, male vocal, deep, soulful",
          "rock, mandarin, male vocal, energetic, powerful",
          "folk, mandarin, female vocal, soft, acoustic",
          "R&B, mandarin, female vocal, smooth, groovy",
          "indie, mandarin, male vocal, dreamy, atmospheric",
        ];
        const style = vocalStyles[Math.floor(Math.random() * vocalStyles.length)];
        console.log("[Music] 選擇風格:", style);

        const audioUrl = await generateSong({
          lyrics: lyrics || `一首關於${theme}的歌`,
          title: `${theme}之歌`,
          style,
        });
        return NextResponse.json({ audioUrl, source: "suno" });
      } catch (sunoErr) {
        console.error("[Suno API 錯誤]", sunoErr);
        // Suno 失敗，fallback 到 mock
      }
    }

    // === Fallback: Mock 純音樂（無歌聲）===
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const sampleRate = 44100;
    const duration = 30; // 30 秒
    const numSamples = sampleRate * duration;
    const numChannels = 1;
    const bitsPerSample = 16;

    const dataSize = numSamples * numChannels * (bitsPerSample / 8);
    const buffer = Buffer.alloc(44 + dataSize);

    // WAV header
    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write("WAVE", 8);
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
    buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write("data", 36);
    buffer.writeUInt32LE(dataSize, 40);

    // 生成音頻樣本
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const sample = generateSample(t, duration, sampleRate);
      const clamped = Math.max(-1, Math.min(1, sample));
      const intSample = Math.round(clamped * 32767);
      buffer.writeInt16LE(intSample, 44 + i * 2);
    }

    const base64 = buffer.toString("base64");
    const audioUrl = `data:audio/wav;base64,${base64}`;

    return NextResponse.json({ audioUrl });
  } catch (error) {
    return NextResponse.json(
      { error: "音樂生成失敗，請稍後再試" },
      { status: 500 }
    );
  }
}
