import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { theme } = await request.json();

    if (!theme || typeof theme !== "string") {
      return NextResponse.json(
        { error: "請提供歌曲主題" },
        { status: 400 }
      );
    }

    // 模擬 AI 生成延遲
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Mock 歌詞生成（LRC 格式，帶時間戳）
    const title = `${theme}之歌`;
    const lyrics = `[00:00.00]【${title}】
[00:02.00]作詞：AI 創作助手
[00:05.00]
[00:08.00][Verse 1]
[00:10.00]在${theme}的世界裡
[00:14.00]每一刻都閃耀著光芒
[00:18.00]夢想在心中悄悄萌芽
[00:22.00]帶著希望向前方
[00:26.00]
[00:28.00][Chorus]
[00:30.00]${theme}，${theme}
[00:34.00]讓我們一起唱響
[00:38.00]用音樂點亮每個夜晚
[00:42.00]讓旋律永遠迴盪
[00:46.00]
[00:48.00][Verse 2]
[00:50.00]穿越時光的長河
[00:54.00]${theme}的故事在延續
[00:58.00]每一個音符都是心跳
[01:02.00]每一段旋律都是記憶
[01:06.00]
[01:08.00][Chorus]
[01:10.00]${theme}，${theme}
[01:14.00]讓我們一起唱響
[01:18.00]用音樂點亮每個夜晚
[01:22.00]讓旋律永遠迴盪
[01:26.00]
[01:28.00][Bridge]
[01:30.00]閉上眼睛感受這一刻
[01:34.00]讓${theme}融入靈魂深處
[01:38.00]不管前方有多少風雨
[01:42.00]我們都會勇敢地走下去
[01:46.00]
[01:48.00][Outro]
[01:50.00]${theme}的歌聲
[01:54.00]永遠在心中迴響...
[02:00.00]`;

    return NextResponse.json({ lyrics, title });
  } catch (error) {
    return NextResponse.json(
      { error: "歌詞生成失敗，請稍後再試" },
      { status: 500 }
    );
  }
}
