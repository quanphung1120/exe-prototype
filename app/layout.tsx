import type { Metadata, Viewport } from "next"
import { Barlow, Barlow_Condensed, Geist, Geist_Mono } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

const fontSans = Barlow({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
})

const fontHeading = Barlow_Condensed({
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700"],
  variable: "--font-heading",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

// Geist powers the dashboard typeface (scoped via the `.font-geist` class).
const fontGeist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
})

export const metadata: Metadata = {
  title: {
    default: "SportMatch AI — Tìm sân. Tìm đối thủ phù hợp.",
    template: "%s · SportMatch AI",
  },
  description:
    "SportMatch AI là trợ lý đặt sân bằng AI cho các môn thể thao vợt. Đặt sân tennis, padel, pickleball, cầu lông và bóng quần chỉ trong vài giây và được ghép với những người chơi cùng trình độ. Hiện đang mở truy cập sớm.",
  keywords: [
    "đặt sân",
    "ghép người chơi",
    "tennis",
    "padel",
    "pickleball",
    "cầu lông",
    "bóng quần",
    "trợ lý AI",
    "thể thao vợt",
  ],
  openGraph: {
    title: "SportMatch AI — Tìm sân. Tìm đối thủ phù hợp.",
    description:
      "Đặt sân và ghép người chơi bằng AI cho các môn thể thao vợt. Đăng ký danh sách chờ truy cập sớm.",
    siteName: "SportMatch AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SportMatch AI — Tìm sân. Tìm đối thủ phù hợp.",
    description:
      "Đặt sân và ghép người chơi bằng AI cho các môn thể thao vợt. Đăng ký danh sách chờ truy cập sớm.",
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontSans.variable,
        fontHeading.variable,
        fontMono.variable,
        fontGeist.variable,
        "font-sans"
      )}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
