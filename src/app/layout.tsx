import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/Feedback";
import { themeBootstrapScript } from "@/lib/theme-bootstrap";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  weight: ["400", "500", "600"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono-code",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "OptiWeb Studio — Make every byte count",
    template: "%s · OptiWeb Studio",
  },
  description:
    "A developer workspace for static asset performance: convert and compress images, audit CSS font-display rules, and measure real byte savings.",
  applicationName: "OptiWeb Studio",
  authors: [{ name: "OptiWeb Studio" }],
  keywords: ["image optimization", "webp", "avif", "font-display", "css", "web performance"],
  openGraph: {
    title: "OptiWeb Studio",
    description: "Make every byte count. Convert images, audit font-display, measure real savings.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  // Both palettes are declared so mobile browser chrome matches the active theme.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0d141c" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the theme attribute is set by the inline script
    // before React hydrates, so the server and client markup intentionally differ.
    <html lang="en" className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:rounded-md focus:border focus:border-accent focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:text-ink"
        >
          Skip to main content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
