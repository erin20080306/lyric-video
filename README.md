# AI 一鍵歌詞影片產生器

輸入主題，自動生成背景圖、歌詞與歌曲。一鍵完成，即時預覽，輕鬆下載。

## 功能特色

- **一鍵生成**：輸入歌曲主題，自動完成背景圖、歌詞、音樂生成
- **即時預覽**：在同一頁面查看所有生成結果
- **多格式下載**：支援 lyrics.txt、background.png、song.mp3、project.json
- **MP4 匯出**（預留）：使用 ffmpeg.wasm 合成影片

## 技術架構

- **框架**：Next.js 14 (App Router)
- **語言**：TypeScript
- **樣式**：Tailwind CSS
- **圖示**：Lucide React
- **部署**：Vercel

## API 端點

| 端點 | 功能 |
|------|------|
| POST `/api/generate-lyrics` | 生成歌詞 |
| POST `/api/generate-image` | 生成背景圖 |
| POST `/api/generate-music` | 生成音樂 |
| POST `/api/export` | 匯出專案資料 |

> 目前所有 API 為 Mock 版本，可替換為真實 AI API。

## 本地開發

```bash
npm install
npm run dev
```

開啟 http://localhost:3000

## 部署到 Vercel

```bash
npm i -g vercel
vercel
```

或直接推送到 GitHub，連結 Vercel 自動部署。

## 專案結構

```
src/
├── app/
│   ├── api/
│   │   ├── generate-lyrics/route.ts
│   │   ├── generate-image/route.ts
│   │   ├── generate-music/route.ts
│   │   └── export/route.ts
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── download.ts
│   └── video-export.ts
└── types/
    └── index.ts
```

## License

MIT
