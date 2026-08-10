import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { isAcqAdmin, listAcquisitionClients } from '@/lib/acquisition-admin';

export const dynamic = 'force-dynamic';

// Acq-admin: roster of acquisition-tagged clients, for the "view as client"
// picker in the Acquisition Dashboard.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth || !(await isAcqAdmin(auth.email))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const clients = await listAcquisitionClients();
  return NextResponse.json({ clients });
}
