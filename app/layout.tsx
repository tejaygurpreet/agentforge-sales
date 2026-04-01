import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DEFAULT_BRAND_DISPLAY_NAME } from "@/lib/brand-prompt";
import "./globals.css";

export { viewport } from "./viewport";

/** Prompt 136 — Inter 400–700; energetic canvas (sage/coral washes in globals). */
const fontSans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const fontMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: DEFAULT_BRAND_DISPLAY_NAME,
    template: `%s · ${DEFAULT_BRAND_DISPLAY_NAME}`,
  },
  description: "Autonomous multi-agent B2B Sales Operating System",
  applicationName: DEFAULT_BRAND_DISPLAY_NAME,
  appleWebApp: {
    capable: true,
    title: DEFAULT_BRAND_DISPLAY_NAME,
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="scroll-smooth">
      <body
        className={`${fontSans.variable} ${fontMono.variable} min-h-screen bg-white font-sans font-normal text-[15px] leading-relaxed tracking-[-0.01em]`}
      >
        <TooltipProvider delayDuration={260} skipDelayDuration={120}>
          {children}
        </TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
