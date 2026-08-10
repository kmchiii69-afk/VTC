import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { isAcqAdmin, listAcquisitionClientProfiles } from '@/lib/acquisition-admin';

export const dynamic = 'force-dynamic';

// Acq-admin read-only panel: full (password-stripped) profiles of every
// acquisition-tagged client. Guarded by isAcqAdmin (role=admin OR acq_admin tag).
export async function GET() {
  const auth = await getAuthUser();
  if (!auth || !(await isAcqAdmin(auth.email))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const clients = await listAcquisitionClientProfiles();
  return NextResponse.json({ clients });
}
