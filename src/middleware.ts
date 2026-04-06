import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const authToken = request.cookies.get("auth_token")?.value;
  const isLoggedIn = authToken === "authenticated";

  // 已登入 → 訪問 /login 自動跳轉首頁
  if (pathname === "/login" && isLoggedIn) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // 未登入 → 非 /login 頁面導向登入
  if (pathname !== "/login" && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * 只攔截頁面路由，排除：
     * - api (API routes)
     * - _next (Next.js 內部)
     * - favicon, manifest 等靜態檔案
     */
    "/((?!api|_next|favicon|manifest|.*\\.).*)",
  ],
};
