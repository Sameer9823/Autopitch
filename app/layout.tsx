import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";

import "./globals.css";
import { cn } from "@/lib/utils";

/**
 * RAISEVIA AI
 * "Build the deck. Prepare for the room. Raise with confidence."
 */

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Raisevia AI — AI Fundraising Workspace for Founders",
    template: "%s · Raisevia AI",
  },
  description:
    "Create investor-ready pitch decks, review your story like an investor, practice tough fundraising questions, and share your deck with investors.",
  applicationName: "Raisevia AI",
  keywords: [
    "pitch deck generator",
    "fundraising workspace",
    "investor review",
    "pitch practice",
    "startup fundraising",
    "AI pitch deck",
  ],
  authors: [{ name: "Raisevia AI" }],
  openGraph: {
    type: "website",
    url: APP_URL,
    siteName: "Raisevia AI",
    title: "Raisevia AI — AI Fundraising Workspace for Founders",
    description:
      "Create investor-ready pitch decks, review your story like an investor, practice tough fundraising questions, and share your deck with investors.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Raisevia AI — AI Fundraising Workspace for Founders",
    description:
      "Build the deck. Prepare for the room. Raise with confidence.",
  },
  robots: {
    // The share viewer is intentionally reachable, but never indexed.
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={cn(
        "h-full antialiased",
        inter.variable,
        geist.variable,
        geistMono.variable,
      )}
    >
      <body className="min-h-full bg-background font-sans text-foreground">
        {children}
      </body>
    </html>
  );
}
