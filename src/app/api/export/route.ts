import { NextRequest, NextResponse } from "next/server";
import type { ExportData } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const data: ExportData = await request.json();

    if (!data.title || !data.lyrics) {
      return NextResponse.json(
        { error: "匯出資料不完整" },
        { status: 400 }
      );
    }

    const exportData: ExportData = {
      title: data.title,
      theme: data.theme,
      lyrics: data.lyrics,
      imageUrl: data.imageUrl,
      audioUrl: data.audioUrl,
      createdAt: data.createdAt || new Date().toISOString(),
      version: "1.0.0",
    };

    return NextResponse.json(exportData);
  } catch (error) {
    return NextResponse.json(
      { error: "匯出失敗，請稍後再試" },
      { status: 500 }
    );
  }
}
