/**
 * Phase 11 SQA — 50-concurrent-user stress test (buildspec §11 done-when).
 *
 * Two phases:
 *  1. Sequentially authenticate the seeded demo accounts once each — a real 50-concurrent-user
 *     scenario is 50 different already-signed-in people, not 50 simultaneous fresh sign-ins
 *     against a handful of shared demo accounts. Doing this concurrently instead trips Supabase
 *     Auth's own sign-in abuse-rate-limiting on repeated attempts for the same identity, which is
 *     Supabase Auth infra behavior, not the backend under test.
 *  2. Fire `concurrency` concurrent authenticated request "sessions" (round-robin over the
 *     pre-authenticated tokens) against the heaviest real endpoints, measuring latency — this is
 *     the actual thing the buildspec's <3s / fail->10s target is about.
 *
 * All requests go through the same @supabase/supabase-js REST client the app always uses, which
 * talks to Supabase's pooled PostgREST gateway (no direct Postgres connection exists in this
 * codebase to route around the pooler).
 *
 * Usage: npx ts-node scripts/stress-test.ts [concurrency] [baseUrl]
 */
import * as dotenv from 'dotenv';
dotenv.config({ quiet: true } as never);

const CONCURRENCY = Number(process.argv[2] ?? 50);
const BASE_URL = process.argv[3] ?? 'http://localhost:8443/api';
const SLOW_THRESHOLD_MS = 3000;
const FAIL_THRESHOLD_MS = 10000;

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Vmmc@2026!';
const STAFF_IDS = Array.from({ length: 20 }, (_, i) => {
  const n = i + 1;
  let yearPrefix = '25';
  if (n <= 5) yearPrefix = '23';
  else if (n <= 12) yearPrefix = '24';
  return `VMMC-${yearPrefix}-${String(n).padStart(4, '0')}`;
});

interface Timing {
  label: string;
  ms: number;
  ok: boolean;
  status?: number;
}

async function timed(label: string, fn: () => Promise<Response>): Promise<Timing> {
  const start = Date.now();
  try {
    const res = await fn();
    return { label, ms: Date.now() - start, ok: res.ok, status: res.status };
  } catch {
    return { label, ms: Date.now() - start, ok: false, status: -1 };
  }
}

async function loginOnce(employeeId: string): Promise<string | null> {
  const portal = employeeId === 'VMMC-23-0001' ? 'admin' : 'staff';
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId, password: DEMO_PASSWORD, portal }),
  });
  if (!res.ok) {
    console.error(`login failed for ${employeeId}: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
    return null;
  }
  const { accessToken } = (await res.json()) as { accessToken: string };
  return accessToken;
}

async function runSession(token: string): Promise<Timing[]> {
  const auth = { Authorization: `Bearer ${token}` };
  return Promise.all([
    timed('dashboard-overview', () => fetch(`${BASE_URL}/dashboard/overview`, { headers: auth })),
    timed('compliance-summary', () => fetch(`${BASE_URL}/me/compliance-summary`, { headers: auth })),
    timed('me-documents', () => fetch(`${BASE_URL}/me/documents`, { headers: auth })),
    timed('me-notifications', () => fetch(`${BASE_URL}/me/notifications`, { headers: auth })),
  ]);
}

async function main() {
  console.log(`Phase 1: authenticating ${STAFF_IDS.length} seeded demo accounts (sequentially)...`);
  const tokens: string[] = [];
  for (const id of STAFF_IDS) {
    const token = await loginOnce(id);
    if (token) tokens.push(token);
  }
  console.log(`Authenticated ${tokens.length}/${STAFF_IDS.length} accounts.\n`);
  if (tokens.length === 0) {
    console.error('No accounts authenticated — aborting.');
    process.exit(1);
  }

  console.log(`Phase 2: ${CONCURRENCY} concurrent authenticated sessions against ${BASE_URL}`);
  const start = Date.now();
  const sessions = Array.from({ length: CONCURRENCY }, (_, i) => tokens[i % tokens.length]);
  const results = await Promise.all(sessions.map((token) => runSession(token)));
  const wallClockMs = Date.now() - start;

  const all = results.flat();
  const failed = all.filter((t) => !t.ok);
  const slow = all.filter((t) => t.ok && t.ms > SLOW_THRESHOLD_MS && t.ms <= FAIL_THRESHOLD_MS);
  const tooSlow = all.filter((t) => t.ok && t.ms > FAIL_THRESHOLD_MS);
  const times = all.filter((t) => t.ok).map((t) => t.ms).sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)] ?? 0;
  const p95 = times[Math.floor(times.length * 0.95)] ?? 0;
  const max = times[times.length - 1] ?? 0;

  console.log(`\nTotal requests: ${all.length} (${CONCURRENCY} sessions x 4 requests each)`);
  console.log(`Wall-clock time for all ${CONCURRENCY} concurrent sessions: ${wallClockMs}ms`);
  console.log(`Failed requests: ${failed.length}`);
  if (failed.length > 0) {
    const byStatus = new Map<string, number>();
    for (const f of failed) {
      const key = `${f.label}:${f.status}`;
      byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
    }
    console.log('  Failure breakdown (label:status -> count):', Object.fromEntries(byStatus));
  }
  console.log(`Requests over ${SLOW_THRESHOLD_MS}ms (but under fail threshold): ${slow.length}`);
  console.log(`Requests over the ${FAIL_THRESHOLD_MS}ms fail threshold: ${tooSlow.length}`);
  console.log(`p50: ${p50}ms | p95: ${p95}ms | max: ${max}ms`);

  const pass = failed.length === 0 && tooSlow.length === 0;
  console.log(`\n${pass ? 'PASS' : 'FAIL'} — buildspec target: 50 concurrent sessions, <3s typical, fail only above 10s.`);
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
