import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { RouteTransition } from '@/components/ui/route-transition';
import { Suspense } from 'react';
import PostHogProvider from '@/components/PostHogProvider';
import { MonthlyFormGate } from '@/components/ui/monthly-form-gate';
import { TodoBubble } from '@/components/ui/todo-bubble';
import { LeaderboardBubble } from '@/components/ui/leaderboard-bubble';
import { ShaderBackground } from '@/components/ui/gem-smoke-metaballs';

export const metadata: Metadata = {
  title: "VTC",
  description: "Member portal for VTC",
};

// Without width=device-width mobile browsers render at ~980px and zoom out,
// which is why the portal looked desktop-shrunk on phones.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#060504",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full" style={{ background: "#060504" }}>
        {/* App-wide animated "Gem Smoke" shader background — sits fixed behind
            all content. Pages need a transparent (or semi-transparent) surface
            for it to show through. */}
        <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
          <ShaderBackground className="h-full w-full" />
        </div>
        <div style={{ position: "relative", zIndex: 1 }}>
          <Suspense>
            <PostHogProvider>
              <RouteTransition>{children}</RouteTransition>
              <MonthlyFormGate />
              <TodoBubble />
              <LeaderboardBubble />
            </PostHogProvider>
          </Suspense>
        </div>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
