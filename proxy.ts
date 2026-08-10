import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';

const PUBLIC_PATHS = ['/', '/api/auth/login'];
const ADMIN_PATHS = ['/admin'];

// Note: /hub, /select and /portal are always accessible to signed-in clients —
// they are no longer feature-gated. Only the per-tab toggles inside /portal are
// gated, and that is enforced client-side via /api/me/features.

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow public paths and static assets
  if (
    PUBLIC_PATHS.includes(pathname) ||
    /\.(png|jpe?g|gif|webp|svg|ico|css|js|woff2?|ttf|otf|mp4|webm|pdf|txt|xml|json)$/.test(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/fathom/') || // check-in webhook — secured by Fathom's Svix signature
    pathname.startsWith('/api/webhooks/') || // calendly/sales webhook — secured by their own signatures
    pathname.startsWith('/api/cron/') ||     // scheduled jobs — secured by CRON_SECRET bearer
    pathname.startsWith('/funnel/') ||       // public funnel pages — no auth required
    pathname.startsWith('/api/funnel/') ||   // funnel lead/application API
    pathname.startsWith('/api/track/') ||    // funnel event/CAPI tracking — anonymous visitors, rate-limited not authed
    pathname.startsWith('/api/calendly/') || // calendly setup/webhook
    pathname.startsWith('/api/bot/')         // SOP-finder bot catalog — secured by BOT_API_SECRET header
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const user = token ? await verifyToken(token) : null;

  if (!user) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Admin routes require admin role; non-admins go to their main panel (/select).
  if (ADMIN_PATHS.some((p) => pathname.startsWith(p))) {
    if (user.role !== 'admin') {
      return NextResponse.redirect(new URL('/select', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
