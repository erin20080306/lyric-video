import { NextResponse } from "next/server";
import { isSunoConfigured } from "@/lib/suno";

export async function GET() {
  return NextResponse.json({
    sunoConfigured: isSunoConfigured(),
    mode: isSunoConfigured() ? "ai-vocal" : "mock-instrumental",
  });
}
