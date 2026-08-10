// Diagnostic: is the dev server's memory growth per-REQUEST or per-ROUTE-COMPILE?
// Spawns `next dev`, then hits endpoints in phases while sampling the node
// process tree's working set. Run with: node scripts/diag-dev-memory.mjs
import { spawn, execSync } from 'child_process';

const nodeMemMB = () => {
  try {
    const out = execSync(
      'powershell -NoProfile -Command "(Get-Process node -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum"',
      { encoding: 'utf8' }
    ).trim();
    return Math.round(Number(out) / 1048576);
  } catch { return -1; }
};

const baseline = nodeMemMB();
console.log(`baseline node.exe total: ${baseline} MB (this diag process included)\n`);

const dev = spawn('npx', ['next', 'dev'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
let ready = false;
dev.stdout.on('data', (b) => { if (/Ready in/.test(String(b))) ready = true; });
dev.stderr.on('data', (b) => { const s = String(b); if (/FATAL|threshold/.test(s)) console.log('[dev]', s.trim().slice(0, 160)); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60 && !ready; i++) await sleep(500);
if (!ready) { console.log('dev server never reported ready'); dev.kill(); process.exit(1); }
await sleep(1500);
console.log(`after startup: ${nodeMemMB()} MB\n`);

const hit = async (path) => {
  try { await fetch(`http://localhost:3000${path}`, { redirect: 'manual', signal: AbortSignal.timeout(120000) }); }
  catch { /* redirects/401s are fine — we only care about the compile + handler run */ }
};

// Phase A: compile a spread of DISTINCT routes once each. Growth here = compile
// + module retention, which is expected and bounded by the route count.
const routes = [
  '/roadmap', '/portal', '/select', '/hub', '/sops', '/modules', '/leaderboard',
  '/api/auth/me', '/api/me/features', '/api/progress/roadmap', '/api/guides',
  '/api/recordings', '/api/me/progress', '/api/me/action-items', '/api/roadmap-content',
];
console.log('── Phase A: first hit on 15 distinct routes (compile cost) ──');
for (const r of routes) { await hit(r); }
const afterCompile = nodeMemMB();
console.log(`after compiling 15 routes: ${afterCompile} MB\n`);

// Phase B: hammer ONE already-compiled endpoint. Any sustained growth here is a
// genuine per-request leak — nothing new is being compiled.
console.log('── Phase B: 300 repeat hits on one compiled endpoint (leak test) ──');
for (let batch = 1; batch <= 6; batch++) {
  for (let i = 0; i < 50; i++) await hit('/api/auth/me');
  console.log(`  after ${batch * 50} repeat requests: ${nodeMemMB()} MB`);
}

// Phase B2: same count of hits on a STATIC public asset. This runs no app code
// at all, so growth here pins the leak on the dev server's request handling
// rather than on anything in this repo.
console.log('\n── Phase B2: 300 hits on a static public asset ──');
for (let batch = 1; batch <= 6; batch++) {
  for (let i = 0; i < 50; i++) await hit('/box1-breakdown.png');
  console.log(`  after ${batch * 50} static requests: ${nodeMemMB()} MB`);
}

// Phase C: repeat the same page render many times.
console.log('\n── Phase C: 60 repeat renders of /roadmap ──');
for (let batch = 1; batch <= 3; batch++) {
  for (let i = 0; i < 20; i++) await hit('/roadmap');
  console.log(`  after ${batch * 20} renders: ${nodeMemMB()} MB`);
}

console.log(`\nfinal: ${nodeMemMB()} MB (baseline was ${baseline} MB)`);
dev.kill('SIGKILL');
try { execSync('powershell -NoProfile -Command "Get-Process node | Where-Object { $_.WorkingSet64 -gt 500MB } | Stop-Process -Force"'); } catch {}
process.exit(0);
