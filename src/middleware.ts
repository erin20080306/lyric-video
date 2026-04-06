import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 只處理頁面路由
  if (pathname !== "/" && pathname !== "/login") {
    return NextResponse.next();
  }

  const authToken = request.cookies.get("auth_token")?.value;
  const isLoggedIn = authToken === "authenticated";

  // 已登入 → 訪問 /login 自動跳轉首頁
  if (pathname === "/login" && isLoggedIn) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // 未登入 → 訪問首頁導向登入
  if (pathname === "/" && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login"],
};
