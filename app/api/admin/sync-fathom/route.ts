import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { importFathomSalesCalls } from '@/lib/sales-sync';
import type { FathomSource } from '@/lib/fathom';

// Listing + import is fast; AI analysis is intentionally NOT done here (it would
// run one Claude call per imported call and blow past the request timeout on a
// backfill of dozens of calls). Imported calls are queued as `pending` and the
// client drives /api/admin/calls/analyze-pending in small batches.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await getAuthUser();
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { max_pages = 20, months_back = 4, source = 'default' } = await req.json().catch(() => ({}));
  const fathomSource = (source === 'sales_manager' ? 'sales_manager' : 'default') as FathomSource;

  const result = await importFathomSalesCalls({
    source: fathomSource,
    maxPages: max_pages,
    monthsBack: months_back,
  });

  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
