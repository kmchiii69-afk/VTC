import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { RouteTransition } from '@/components/ui/route-transition';
import { Suspense } from 'react';
import PostHogProvider from '@/components/PostHogProvider';
import { WavesBackground } from '@/components/ui/waves-shader';
import { VtcProfile } from '@/components/ui/vtc-profile';

export const metadata: Metadata = {
  title: "VTC",
  description: "Member portal for VTC",
};

// Without width=device-width mobile browsers render at ~980px and zoom out,
// which is why the portal looked desktop-shrunk on phones.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1A1423",
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
      <body className="min-h-full" style={{ background: "#1A1423" }}>
        {/* App-wide animated "Waves" flow shader — fixed behind all content.
            Pages use translucent dark-glass surfaces so it shows through. */}
        <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
          <WavesBackground className="h-full w-full" />
        </div>
        {/* Contrast scrim — darkens the shader's bright regions so cream text
            stays readable on every page, while keeping the Waves look. */}
        <div aria-hidden style={{
          position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
          background: "linear-gradient(180deg, rgba(18,13,24,0.72) 0%, rgba(18,13,24,0.55) 42%, rgba(18,13,24,0.66) 100%)",
        }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <Suspense>
            <PostHogProvider>
              <RouteTransition>{children}</RouteTransition>
              <VtcProfile />
            </PostHogProvider>
          </Suspense>
        </div>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
