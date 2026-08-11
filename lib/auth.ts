import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'ba-portal-jwt-secret-change-in-production'
);

export const COOKIE_NAME = 'ba_auth_token';

// Session version. Every token is stamped with this; verifyToken rejects any
// token whose version doesn't match. Bump this number to invalidate ALL
// outstanding sessions at once (a global "log everyone out"). The bump from
// no-version → 1 logs out everyone who was signed in before this shipped.
export const TOKEN_VERSION = 1;
export const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 30, // 30 days
  path: '/',
};

export interface AuthPayload {
  email: string;
  role: 'user' | 'admin';
  // Internal seat (account manager, editor, scriptwriter, …). null/undefined for
  // regular clients. Stamped at login; admins see everything regardless.
  teamRole?: string | null;
}

export async function signToken(payload: AuthPayload): Promise<string> {
  return new SignJWT({ ...payload, v: TOKEN_VERSION } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    // Reject tokens minted under an older session version (global logout).
    if (payload.v !== TOKEN_VERSION) return null;
    return {
      email: payload.email as string,
      role: payload.role as 'user' | 'admin',
      teamRole: (payload.teamRole as string | null | undefined) ?? null,
    };
  } catch {
    return null;
  }
}

export async function getAuthUser(): Promise<AuthPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    const payload = await verifyToken(token);
    if (!payload) return null;
    // Authoritative check: the account must still exist and be active. A deleted
    // or deactivated user is logged out immediately, even though their JWT is
    // still cryptographically valid. Dynamic import keeps lib/kv (bcrypt/
    // supabase) out of the edge proxy bundle, which only ever calls verifyToken.
    const { getUser } = await import('@/lib/kv');
    const user = await getUser(payload.email);
    if (!user || !user.active) return null;
    // Only approved accounts may hold a session. Pending users never receive a
    // token, but this rejects any stale/forged cookie for a non-approved account.
    if (user.status && user.status !== 'approved') return null;
    return payload;
  } catch {
    return null;
  }
}
