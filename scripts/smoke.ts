/**
 * Post-deploy smoke check — no browser, just HTTP. Run against the deployed
 * URL (staging or prod) to catch a broken deploy before anyone notices.
 *
 *   BASE_URL=https://www.persons-staffs.uz npx tsx scripts/smoke.ts
 *
 * Exits non-zero on the first failure. Wired into cloudbuild after the
 * deploy step.
 */
const BASE = (process.env.BASE_URL ?? 'https://www.persons-staffs.uz').replace(/\/$/, '');

type Check = { name: string; run: () => Promise<void> };

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function get(path: string, redirect: 'follow' | 'manual' = 'follow') {
  const res = await fetch(`${BASE}${path}`, { redirect, headers: { 'cache-control': 'no-cache' } });
  const body = res.status < 400 || res.status === 503 ? await res.text() : '';
  return { res, body };
}

const checks: Check[] = [
  {
    name: 'GET /staff/api/health → 200, db ok',
    run: async () => {
      const { res, body } = await get('/staff/api/health');
      assert(res.status === 200, `expected 200, got ${res.status}`);
      const json = JSON.parse(body) as { status?: string; db?: boolean };
      assert(json.status === 'ok', `status = ${json.status}`);
      assert(json.db === true, 'db not reachable');
    },
  },
  ...['en', 'ru', 'uz'].map((locale) => ({
    name: `GET /staff/${locale}/login → 200 with the login form`,
    run: async () => {
      const { res, body } = await get(`/staff/${locale}/login`);
      assert(res.status === 200, `expected 200, got ${res.status}`);
      assert(!body.includes('Sayt tuzatish va yangilash'), 'still serving the maintenance page');
      assert(body.includes('name="phone"') && body.includes('name="password"'), 'login form fields missing');
    },
  })),
  {
    name: 'GET /staff/uz/dashboard → 307 to login (auth gate works)',
    run: async () => {
      const { res } = await get('/staff/uz/dashboard', 'manual');
      assert(res.status === 307, `expected 307, got ${res.status}`);
      assert((res.headers.get('location') ?? '').includes('/login'), 'not redirected to /login');
    },
  },
  {
    name: 'GET /staff/robots.txt → 200',
    run: async () => {
      const { res } = await get('/staff/robots.txt');
      assert(res.status === 200, `expected 200, got ${res.status}`);
    },
  },
  {
    name: 'GET /staff/sitemap.xml → 200 XML',
    run: async () => {
      const { res, body } = await get('/staff/sitemap.xml');
      assert(res.status === 200, `expected 200, got ${res.status}`);
      assert(body.trimStart().startsWith('<?xml'), 'not XML');
    },
  },
];

async function main() {
  console.log(`smoke: ${BASE}`);
  let failed = 0;
  for (const check of checks) {
    try {
      await check.run();
      console.log(`  ✓ ${check.name}`);
    } catch (error) {
      failed += 1;
      console.error(`  ✗ ${check.name}\n      ${error instanceof Error ? error.message : error}`);
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll smoke checks passed.');
}

main();
