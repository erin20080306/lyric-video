import { NextRequest, NextResponse } from "next/server";

const SITE_PASSWORD = process.env.SITE_PASSWORD || "qwe811122";

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    if (password === SITE_PASSWORD) {
      const response = NextResponse.json({ success: true });
      response.cookies.set("auth_token", "authenticated", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7, // 7 天
        path: "/",
      });
      return response;
    }

    return NextResponse.json(
      { success: false, error: "密碼錯誤" },
      { status: 401 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "認證失敗" },
      { status: 500 }
    );
  }
}
