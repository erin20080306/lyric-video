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

    // Mock 歌詞生成
    const title = `${theme}之歌`;
    const lyrics = `【${title}】

作詞：AI 創作助手

[Verse 1]
在${theme}的世界裡
每一刻都閃耀著光芒
夢想在心中悄悄萌芽
帶著希望向前方

[Chorus]
${theme}，${theme}
讓我們一起唱響
用音樂點亮每個夜晚
讓旋律永遠迴盪

[Verse 2]
穿越時光的長河
${theme}的故事在延續
每一個音符都是心跳
每一段旋律都是記憶

[Chorus]
${theme}，${theme}
讓我們一起唱響
用音樂點亮每個夜晚
讓旋律永遠迴盪

[Bridge]
閉上眼睛感受這一刻
讓${theme}融入靈魂深處
不管前方有多少風雨
我們都會勇敢地走下去

[Outro]
${theme}的歌聲
永遠在心中迴響...`;

    return NextResponse.json({ lyrics, title });
  } catch (error) {
    return NextResponse.json(
      { error: "歌詞生成失敗，請稍後再試" },
      { status: 500 }
    );
  }
}
