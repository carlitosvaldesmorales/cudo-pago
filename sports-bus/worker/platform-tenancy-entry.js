import { handlePublicChampionshipRequest } from './public-championship-entry.js';

const PLATFORM_ID = 'FUTBOL-CHEPICA';
const STATIC_WEB_ORIGINS = new Set([
  'https://cudo.cl',
  'https://www.cudo.cl',
  'https://carlitosvaldesmorales.github.io'
]);

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=30, stale-while-revalidate=60',
      ...extraHeaders
    }
  });
}

async function corsFor(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return {};
  if (STATIC_WEB_ORIGINS.has(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };
  }

  if (!env.DB) return null;
  let hostname;
  try {
    hostname = new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
  const binding = await env.DB.prepare(`
    SELECT hostname
    FROM web_host_bindings
    WHERE hostname=? AND verification_status='VERIFIED' AND active=1
  `).bind(hostname).first();
  if (!binding) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

async function getPlatform(db) {
  return db.prepare(`
    SELECT platform_id,canonical_name,slug
    FROM platforms
    WHERE platform_id=? AND active=1
  `).bind(PLATFORM_ID).first();
}

async function listTenants(db) {
  const result = await db.prepare(`
    SELECT t.tenant_id,t.platform_id,t.club_id,t.slug,t.display_name,t.route_path,
           tm.canonical_name AS sporting_name,tm.group_id,
           (
             SELECT h.hostname
             FROM web_host_bindings h
             WHERE h.tenant_id=t.tenant_id
               AND h.scope='TENANT'
               AND h.verification_status='VERIFIED'
               AND h.active=1
             ORDER BY h.hostname
             LIMIT 1
           ) AS hostname
    FROM tenants t
    JOIN teams tm ON tm.team_id=t.club_id
    WHERE t.platform_id=? AND t.active=1
    ORDER BY tm.group_id,tm.canonical_name,t.tenant_id
  `).bind(PLATFORM_ID).all();
  return (result.results || []).map(row => ({
    tenant_id: row.tenant_id,
    club_id: row.club_id,
    slug: row.slug,
    display_name: row.display_name,
    sporting_name: row.sporting_name,
    group_id: row.group_id,
    route_path: row.route_path,
    hostname: row.hostname || null
  }));
}

async function findTenant(db, key) {
  const raw = decodeURIComponent(String(key || '')).trim();
  if (!raw) return null;
  return db.prepare(`
    SELECT t.tenant_id,t.platform_id,t.club_id,t.slug,t.display_name,t.route_path,
           tm.canonical_name AS sporting_name,tm.group_id
    FROM tenants t
    JOIN teams tm ON tm.team_id=t.club_id
    WHERE t.platform_id=? AND t.active=1
      AND (t.tenant_id=? OR lower(t.slug)=lower(?))
    LIMIT 1
  `).bind(PLATFORM_ID, raw, raw).first();
}

async function verifiedHostnames(db, tenantId) {
  const result = await db.prepare(`
    SELECT hostname
    FROM web_host_bindings
    WHERE platform_id=? AND tenant_id=? AND scope='TENANT'
      AND verification_status='VERIFIED' AND active=1
    ORDER BY hostname
  `).bind(PLATFORM_ID, tenantId).all();
  return (result.results || []).map(row => row.hostname);
}

async function declaredHostnames(db, tenantId) {
  const result = await db.prepare(`
    SELECT hostname,verification_status,active
    FROM web_host_bindings
    WHERE platform_id=? AND tenant_id=? AND scope='TENANT'
    ORDER BY hostname
  `).bind(PLATFORM_ID, tenantId).all();
  return (result.results || []).map(row => ({
    hostname: row.hostname,
    verification_status: row.verification_status,
    active: Number(row.active) === 1
  }));
}

async function platformDomainBindings(db) {
  const result = await db.prepare(`
    SELECT hostname,verification_status,active
    FROM web_host_bindings
    WHERE platform_id=? AND scope='PLATFORM' AND tenant_id IS NULL
    ORDER BY hostname
  `).bind(PLATFORM_ID).all();
  return (result.results || []).map(row => ({
    hostname: row.hostname,
    verification_status: row.verification_status,
    active: Number(row.active) === 1
  }));
}

async function publicCompetitionProjection(env) {
  const response = await handlePublicChampionshipRequest(
    new Request('https://internal.invalid/api/v1/public-championship'),
    env
  );
  if (!response) return { ok: false, status: 500, body: { ok: false, error: 'public_projection_unavailable' } };
  const body = await response.json();
  return { ok: response.ok && body.ok, status: response.status, body };
}

function tenantDto(row, hostnames = []) {
  return {
    tenant_id: row.tenant_id,
    platform_id: row.platform_id,
    club_id: row.club_id,
    slug: row.slug,
    display_name: row.display_name,
    sporting_name: row.sporting_name,
    group_id: row.group_id,
    route_path: row.route_path,
    hostnames
  };
}

async function platformResponse(env) {
  const platform = await getPlatform(env.DB);
  if (!platform) return { status: 404, body: { ok: false, error: 'platform_not_found' } };
  const [clubs, competitionsResult, domainBindings] = await Promise.all([
    listTenants(env.DB),
    env.DB.prepare(`
      SELECT competition_id,name,season_id,phase
      FROM competitions
      WHERE platform_id=? AND active=1
      ORDER BY season_id DESC,competition_id
    `).bind(PLATFORM_ID).all(),
    platformDomainBindings(env.DB)
  ]);
  return {
    status: 200,
    body: {
      ok: true,
      contract: 'platform-tenancy-v1',
      platform: {
        platform_id: platform.platform_id,
        name: platform.canonical_name,
        slug: platform.slug,
        domain_bindings: domainBindings
      },
      competitions: competitionsResult.results || [],
      clubs,
      summary: {
        clubs: clubs.length,
        competitions: (competitionsResult.results || []).length
      }
    }
  };
}

async function tenantMatchesResponse(env, tenant) {
  const projection = await publicCompetitionProjection(env);
  if (!projection.ok) return { status: projection.status, body: projection.body };
  const matches = (projection.body.matches || []).filter(
    match => match.home_id === tenant.club_id || match.away_id === tenant.club_id
  );
  const byes = (projection.body.byes || []).filter(bye => bye.team_id === tenant.club_id);
  return {
    status: 200,
    body: {
      ok: true,
      contract: 'tenant-matches-v1',
      tenant: tenantDto(tenant),
      competition: projection.body.competition,
      series_order: projection.body.series_order,
      matches,
      byes,
      summary: {
        matches: matches.length,
        byes: byes.length
      }
    }
  };
}

async function siteContextResponse(request, env) {
  const platform = await getPlatform(env.DB);
  if (!platform) return { status: 404, body: { ok: false, error: 'platform_not_found' } };
  const hostname = new URL(request.url).hostname.toLowerCase();

  if (hostname.endsWith('.workers.dev') || hostname === 'localhost' || hostname.endsWith('.invalid')) {
    return {
      status: 200,
      body: {
        ok: true,
        contract: 'site-context-v1',
        context: 'PLATFORM',
        resolution: 'SERVICE_DEFAULT',
        platform: {
          platform_id: platform.platform_id,
          name: platform.canonical_name,
          slug: platform.slug
        },
        tenant: null
      }
    };
  }

  const binding = await env.DB.prepare(`
    SELECT hostname,scope,tenant_id
    FROM web_host_bindings
    WHERE hostname=? AND platform_id=?
      AND verification_status='VERIFIED' AND active=1
    LIMIT 1
  `).bind(hostname, PLATFORM_ID).first();
  if (!binding) {
    return { status: 404, body: { ok: false, error: 'host_not_bound', hostname } };
  }

  if (binding.scope === 'PLATFORM') {
    return {
      status: 200,
      body: {
        ok: true,
        contract: 'site-context-v1',
        context: 'PLATFORM',
        resolution: 'VERIFIED_HOST',
        platform: {
          platform_id: platform.platform_id,
          name: platform.canonical_name,
          slug: platform.slug
        },
        tenant: null
      }
    };
  }

  const tenant = await findTenant(env.DB, binding.tenant_id);
  if (!tenant) return { status: 404, body: { ok: false, error: 'tenant_not_found_for_host', hostname } };
  return {
    status: 200,
    body: {
      ok: true,
      contract: 'site-context-v1',
      context: 'TENANT',
      resolution: 'VERIFIED_HOST',
      platform: {
        platform_id: platform.platform_id,
        name: platform.canonical_name,
        slug: platform.slug
      },
      tenant: tenantDto(tenant, [hostname])
    }
  };
}

export async function handlePlatformTenancyRequest(request, env) {
  const url = new URL(request.url);
  const isPlatform = url.pathname === '/api/v1/platform';
  const isClubs = url.pathname === '/api/v1/clubs';
  const isSiteContext = url.pathname === '/api/v1/site-context';
  const tenantMatch = url.pathname.match(/^\/api\/v1\/tenant\/([^/]+)(\/matches)?$/);
  if (!isPlatform && !isClubs && !isSiteContext && !tenantMatch) return null;

  const cors = await corsFor(request, env);
  if (request.method === 'OPTIONS') {
    return cors
      ? new Response(null, { status: 204, headers: cors })
      : new Response(null, { status: 403 });
  }
  if (request.method !== 'GET') {
    return json({ ok: false, error: 'method_not_allowed' }, 405, cors || {});
  }
  if (!env.DB) {
    return json({ ok: false, error: 'persistence_not_configured' }, 503, cors || {});
  }

  if (isPlatform) {
    const result = await platformResponse(env);
    return json(result.body, result.status, cors || {});
  }

  if (isClubs) {
    const platform = await getPlatform(env.DB);
    if (!platform) return json({ ok: false, error: 'platform_not_found' }, 404, cors || {});
    const clubs = await listTenants(env.DB);
    return json({
      ok: true,
      contract: 'platform-clubs-v1',
      platform_id: PLATFORM_ID,
      clubs,
      summary: { clubs: clubs.length }
    }, 200, cors || {});
  }

  if (isSiteContext) {
    const result = await siteContextResponse(request, env);
    return json(result.body, result.status, cors || {});
  }

  const tenant = await findTenant(env.DB, tenantMatch[1]);
  if (!tenant) return json({ ok: false, error: 'tenant_not_found' }, 404, cors || {});

  if (tenantMatch[2] === '/matches') {
    const result = await tenantMatchesResponse(env, tenant);
    return json(result.body, result.status, cors || {});
  }

  const [hosts, declared] = await Promise.all([
    verifiedHostnames(env.DB, tenant.tenant_id),
    declaredHostnames(env.DB, tenant.tenant_id)
  ]);
  return json({
    ok: true,
    contract: 'tenant-profile-v1',
    tenant: tenantDto(tenant, hosts),
    domain_bindings: declared
  }, 200, cors || {});
}
