import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RealtimeProvider } from "@/components/RealtimeProvider";
import { THEME_BOOT_SCRIPT, ThemeProvider } from "@/components/ThemeProvider";
import TopNav from "@/components/TopNav";

export const metadata: Metadata = {
  title: "HelpLoop — Find Help. Match Help. Move Help.",
  description:
    "A live community-help map: HelpLoop researches real food resources, ranks the best match for your situation, and connects a volunteer in realtime.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#05070f" },
    { media: "(prefers-color-scheme: light)", color: "#f3f5fa" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before first paint — no palette flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="h-full bg-ink-950 text-mist-200 antialiased">
        <ThemeProvider>
          <RealtimeProvider>
            <div className="flex h-screen flex-col overflow-hidden">
              <TopNav />
              <main className="min-h-0 flex-1">{children}</main>
            </div>
          </RealtimeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
