import assert from 'node:assert/strict';

const BASE = process.env.CUDO_SPORTS_BASE || 'https://cudo-sports-event-bus.carlos-valdes-morales.workers.dev';

async function get(pathname, { origin } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const headers = origin ? { Origin: origin } : {};
      const response = await fetch(`${BASE}${pathname}`, { headers });
      const text = await response.text();
      let body;
      try { body = JSON.parse(text); } catch { body = null; }
      if (response.ok && body?.ok) return { response, body };
      lastError = new Error(`${pathname} HTTP ${response.status}: ${text.slice(0, 500)}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw lastError || new Error(`No response for ${pathname}`);
}

const platform = await get('/api/v1/platform', { origin: 'https://cudo.cl' });
assert.equal(platform.body.contract, 'platform-tenancy-v1');
assert.equal(platform.body.platform.platform_id, 'FUTBOL-CHEPICA');
assert.equal(platform.body.platform.name, 'Fútbol Chépica');
assert.equal(platform.body.summary.clubs, 11);
assert.equal(platform.body.summary.competitions, 1);
assert.ok(platform.body.competitions.some(c => c.competition_id === 'ANFA-CHEPICA-2026'));
assert.equal(platform.response.headers.get('access-control-allow-origin'), 'https://cudo.cl');
assert.deepEqual(platform.body.platform.domain_bindings, [
  { hostname: 'futbolchepica.cl', verification_status: 'DECLARED', active: false },
  { hostname: 'www.futbolchepica.cl', verification_status: 'DECLARED', active: false }
]);

const clubs = await get('/api/v1/clubs');
assert.equal(clubs.body.contract, 'platform-clubs-v1');
assert.equal(clubs.body.platform_id, 'FUTBOL-CHEPICA');
assert.equal(clubs.body.clubs.length, 11);
const cudoCatalog = clubs.body.clubs.find(c => c.tenant_id === 'CUDO');
assert.ok(cudoCatalog);
assert.equal(cudoCatalog.club_id, 'UNION-ORILLA');
assert.equal(cudoCatalog.hostname, null, 'declared custom domain must not be treated as verified/active');

const cudo = await get('/api/v1/tenant/CUDO');
assert.equal(cudo.body.contract, 'tenant-profile-v1');
assert.equal(cudo.body.tenant.tenant_id, 'CUDO');
assert.equal(cudo.body.tenant.club_id, 'UNION-ORILLA');
assert.equal(cudo.body.tenant.display_name, 'C.U.D.O.');
assert.equal(cudo.body.tenant.sporting_name, 'Unión Orilla');
assert.equal(cudo.body.tenant.route_path, '/clubes/cudo');
assert.deepEqual(cudo.body.tenant.hostnames, []);
assert.ok(cudo.body.domain_bindings.some(b => b.hostname === 'cudo.cl' && b.verification_status === 'DECLARED' && b.active === false));

const cudoMatches = await get('/api/v1/tenant/CUDO/matches');
assert.equal(cudoMatches.body.contract, 'tenant-matches-v1');
assert.equal(cudoMatches.body.tenant.club_id, 'UNION-ORILLA');
assert.equal(cudoMatches.body.matches.length, 5);
assert.ok(cudoMatches.body.matches.every(m => m.home_id === 'UNION-ORILLA' || m.away_id === 'UNION-ORILLA'));
assert.ok(cudoMatches.body.matches.every(m => Array.isArray(m.series) && m.series.length === 4));
for (const match of cudoMatches.body.matches) {
  for (const serie of match.series) {
    if (serie.public_status !== 'OFFICIAL') {
      assert.equal(serie.home_score, null);
      assert.equal(serie.away_score, null);
    }
  }
}

const santa = await get('/api/v1/tenant/SANTA-ELENA/matches');
assert.equal(santa.body.tenant.club_id, 'SANTA-ELENA');
assert.equal(santa.body.matches.length, 5);
assert.ok(santa.body.matches.every(m => m.home_id === 'SANTA-ELENA' || m.away_id === 'SANTA-ELENA'));
assert.notDeepEqual(
  cudoMatches.body.matches.map(m => m.match_id).sort(),
  santa.body.matches.map(m => m.match_id).sort()
);

const context = await get('/api/v1/site-context');
assert.equal(context.body.contract, 'site-context-v1');
assert.equal(context.body.context, 'PLATFORM');
assert.equal(context.body.resolution, 'SERVICE_DEFAULT');
assert.equal(context.body.platform.platform_id, 'FUTBOL-CHEPICA');
assert.equal(context.body.tenant, null);

console.log(`PASS runtime ${BASE}`);
console.log('PASS Fútbol Chépica is the deployed platform root');
console.log('PASS 11 tenants are visible and CUDO maps to UNION-ORILLA');
console.log('PASS CUDO and Santa Elena receive distinct club-scoped projections');
console.log('PASS non-official series do not leak scores through tenant projection');
console.log('PASS cudo.cl remains declared but inactive/unverified');
console.log('PASS futbolchepica.cl is persisted as declared PLATFORM hostname and remains inactive/unverified');
console.log('PASS Worker service context resolves to PLATFORM');
console.log('RESULT: PASS');
