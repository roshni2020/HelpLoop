"use client";

import "./globals.css";

// RealtimeProvider lives in the root layout, so a backend failure lands here
// rather than in a route-level error.tsx.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en" data-theme="dark">
      <body className="h-full bg-ink-950 text-mist-200 antialiased">
        <main className="flex h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-2xl font-semibold">HelpLoop is temporarily unavailable</h1>
          <p className="max-w-md">
            We can&apos;t reach our live service right now. If you need help today, call 211 in the
            US to reach local food, shelter and support services.
          </p>
          <button type="button" onClick={reset} className="rounded-lg border px-4 py-2 font-medium">
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
