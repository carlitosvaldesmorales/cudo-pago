const PUBLIC_COMPETITION = 'ANFA-CHEPICA-2026';
const SERIES = ['TERCERA', 'SEGUNDA', 'SENIOR', 'PRIMERA'];
const SERIES_LABEL = {
  TERCERA: '3ª',
  SEGUNDA: '2ª',
  SENIOR: 'Senior',
  PRIMERA: '1ª'
};
const ALLOWED_ORIGINS = new Set([
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

function corsFor(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return {};
  if (!ALLOWED_ORIGINS.has(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function publicSeries(code, row) {
  const base = {
    series_code: code,
    label: SERIES_LABEL[code],
    public_status: 'PENDING',
    home_score: null,
    away_score: null
  };
  if (!row) return base;

  if (row.validation_status === 'VERIFIED') {
    return {
      ...base,
      public_status: 'OFFICIAL',
      home_score: Number(row.home_score),
      away_score: Number(row.away_score)
    };
  }
  if (row.validation_status === 'DISPUTED') {
    return { ...base, public_status: 'IN_REVIEW' };
  }
  if (row.validation_status === 'ANNULLED') {
    return { ...base, public_status: 'ANNULLED' };
  }
  return base;
}

function matchPublicStatus(series) {
  if (series.some(s => s.public_status === 'IN_REVIEW')) return 'IN_REVIEW';
  if (series.some(s => s.public_status === 'ANNULLED')) return 'HAS_ANNULLED';
  if (series.every(s => s.public_status === 'OFFICIAL')) return 'COMPLETE';
  if (series.some(s => s.public_status === 'OFFICIAL')) return 'PARTIAL';
  return 'PENDING';
}

export async function handlePublicChampionshipRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/v1/public-championship') return null;

  const cors = corsFor(request);
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

  const [competition, matchesResult, seriesResult, byesResult] = await Promise.all([
    env.DB.prepare(`
      SELECT competition_id,name,season_id,phase
      FROM competitions
      WHERE competition_id=? AND active=1
    `).bind(PUBLIC_COMPETITION).first(),
    env.DB.prepare(`
      SELECT match_id,competition_id,season_id,group_id,round_no,round_label,kickoff_at,
             home_id,home_name,away_id,away_name
      FROM matches
      WHERE competition_id=?
      ORDER BY round_no,group_id,match_id
    `).bind(PUBLIC_COMPETITION).all(),
    env.DB.prepare(`
      SELECT r.match_id,r.series_code,r.home_score,r.away_score,r.validation_status
      FROM match_series_results r
      JOIN matches m ON m.match_id=r.match_id
      WHERE m.competition_id=?
      ORDER BY m.round_no,m.group_id,r.match_id,
        CASE r.series_code
          WHEN 'TERCERA' THEN 1
          WHEN 'SEGUNDA' THEN 2
          WHEN 'SENIOR' THEN 3
          WHEN 'PRIMERA' THEN 4
          ELSE 9
        END
    `).bind(PUBLIC_COMPETITION).all(),
    env.DB.prepare(`
      SELECT b.bye_id,b.competition_id,b.season_id,b.group_id,b.round_no,b.team_id,
             COALESCE(t.canonical_name,b.team_id) AS team_name
      FROM byes b
      LEFT JOIN teams t ON t.team_id=b.team_id
      WHERE b.competition_id=?
      ORDER BY b.round_no,b.group_id,b.team_id
    `).bind(PUBLIC_COMPETITION).all()
  ]);

  if (!competition) {
    return json({ ok: false, error: 'public_competition_not_found' }, 404, cors || {});
  }

  const seriesByMatch = new Map();
  for (const row of seriesResult.results || []) {
    if (!SERIES.includes(row.series_code)) continue;
    if (!seriesByMatch.has(row.match_id)) seriesByMatch.set(row.match_id, new Map());
    seriesByMatch.get(row.match_id).set(row.series_code, row);
  }

  const matches = (matchesResult.results || []).map(row => {
    const current = seriesByMatch.get(row.match_id) || new Map();
    const series = SERIES.map(code => publicSeries(code, current.get(code)));
    return {
      match_id: row.match_id,
      competition_id: row.competition_id,
      season_id: row.season_id,
      group_id: row.group_id,
      round_no: Number(row.round_no),
      round_label: row.round_label,
      kickoff_at: row.kickoff_at || null,
      home_id: row.home_id,
      home_name: row.home_name,
      away_id: row.away_id,
      away_name: row.away_name,
      public_status: matchPublicStatus(series),
      series
    };
  });

  const byes = (byesResult.results || []).map(row => ({
    bye_id: row.bye_id,
    competition_id: row.competition_id,
    season_id: row.season_id,
    group_id: row.group_id,
    round_no: Number(row.round_no),
    team_id: row.team_id,
    team_name: row.team_name
  }));

  const statusCounts = { OFFICIAL: 0, IN_REVIEW: 0, ANNULLED: 0, PENDING: 0 };
  for (const match of matches) {
    for (const serie of match.series) statusCounts[serie.public_status] += 1;
  }

  return json({
    ok: true,
    contract: 'public-championship-v1',
    competition: {
      competition_id: competition.competition_id,
      name: competition.name,
      season_id: competition.season_id,
      phase: competition.phase
    },
    series_order: SERIES,
    matches,
    byes,
    summary: {
      matches: matches.length,
      byes: byes.length,
      series: statusCounts
    }
  }, 200, cors || {});
}
