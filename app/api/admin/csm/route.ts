import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getClientsHealth } from '@/lib/csm';

// CSM dashboard list: every client with at-a-glance health.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const clients = await getClientsHealth();
  return NextResponse.json({ clients });
}
