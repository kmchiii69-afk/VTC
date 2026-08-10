// Authorization + client roster for Acquisition Dashboard admins.
//
// An "acquisition admin" is either a full app admin (role='admin') or any
// account tagged with the `acq_admin` feature. They can edit the global SOP
// sections and view/edit every acquisition-tagged client's own content.

import { db, getUser, type PublicUser } from '@/lib/kv';

export async function isAcqAdmin(email: string): Promise<boolean> {
  const u = await getUser(email);
  if (!u || !u.active) return false;
  if (u.role === 'admin') return true;
  return Array.isArray(u.features) && u.features.includes('acq_admin');
}

// True only if the target account is itself an acquisition-tagged CLIENT. Used to
// scope an acq-admin's read access: they may only view accounts they oversee, so
// a non-acquisition member can't be read by guessing an email.
export async function isAcquisitionClient(email: string): Promise<boolean> {
  const u = await getUser(email);
  return !!u && Array.isArray(u.features) && u.features.includes('acquisition');
}

// Whether `caller` may perform admin actions (view/add/edit/delete/reorder a
// member's actionables) ON `client`. Full app admins (role='admin') may act on
// ANY client; acq-admins (acq_admin feature, not full admins) may act ONLY on
// acquisition-tagged clients — so an acq-admin can never touch a non-acquisition
// member. Regular members get false and stay scoped to their own /api/me/* routes.
export async function canAdminManageClient(callerEmail: string, clientEmail: string): Promise<boolean> {
  const u = await getUser(callerEmail);
  if (!u || !u.active) return false;
  if (u.role === 'admin') return true;
  const isAcqAdminUser = Array.isArray(u.features) && u.features.includes('acq_admin');
  return isAcqAdminUser ? isAcquisitionClient(clientEmail) : false;
}

export interface AcqClient { email: string; name: string }

// Every account tagged `acquisition` (the clients an acq-admin oversees).
export async function listAcquisitionClients(): Promise<AcqClient[]> {
  const { data } = await db()
    .from('portal_users')
    .select('email, name')
    .contains('features', ['acquisition']);
  return (data || []).map((r) => ({ email: r.email as string, name: (r.name as string) || (r.email as string) }));
}

// Full (password-stripped) profiles of every acquisition-tagged client, for the
// acq-admin's read-only member panel.
export async function listAcquisitionClientProfiles(): Promise<PublicUser[]> {
  const { data } = await db()
    .from('portal_users')
    .select('*')
    .contains('features', ['acquisition'])
    .order('created_at', { ascending: false });
  return (data || []).map((row) => {
    const { password_hash: _drop, ...safe } = row as Record<string, unknown>;
    return safe as unknown as PublicUser;
  });
}
