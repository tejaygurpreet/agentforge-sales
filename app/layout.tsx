import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export { viewport } from "./viewport";

const fontSans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const fontMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AgentForge Sales",
  description: "Autonomous multi-agent B2B Sales Operating System",
  applicationName: "AgentForge Sales",
  appleWebApp: {
    capable: true,
    title: "AgentForge Sales",
    statusBarStyle: "black-translucent",
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
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fontSans.variable} ${fontMono.variable} min-h-screen font-sans`}
      >
        <TooltipProvider delayDuration={220}>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
