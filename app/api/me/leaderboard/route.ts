import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getLeaderboard } from '@/lib/weekly-cash';

// GET → the organic cash-collected leaderboard for the current month window
// (collective sum, resets on the 2nd). Any signed-in member may view it; the
// caller's own row is flagged so the bubble can highlight it.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const board = await getLeaderboard();
  const me = user.email.toLowerCase().trim();

  // Dev-only preview: with no real submissions yet, show sample rows so the
  // leaderboard UI can be seen populated. Never returned in production.
  if (board.entries.length === 0 && process.env.NODE_ENV !== 'production') {
    return NextResponse.json({
      monthLabel: board.monthLabel,
      total: 13600,
      entries: [
        { name: 'Jordan Blake', cash: 8200, rank: 1, isMe: false },
        { name: 'Sam Rivera',   cash: 5400, rank: 2, isMe: false },
      ],
    });
  }

  return NextResponse.json({
    monthLabel: board.monthLabel,
    total: board.total,
    entries: board.entries.map((e) => ({ name: e.name, cash: e.cash, rank: e.rank, isMe: e.email === me })),
  });
}
