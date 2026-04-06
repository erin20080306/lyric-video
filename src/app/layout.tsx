import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 一鍵歌詞影片產生器",
  description: "輸入主題，自動生成背景圖、歌詞、歌曲，一鍵完成音樂影片製作",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
