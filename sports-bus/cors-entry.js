import worker from './worker/index.js';

const ALLOWED_ORIGINS = new Set([
  'https://cudo.cl',
  'https://www.cudo.cl',
  'https://carlitosvaldesmorales.github.io'
]);

function isPublicApi(request) {
  const url = new URL(request.url);
  return url.pathname.startsWith('/api/v1/');
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

export default {
  async fetch(request, env, ctx) {
    if (isPublicApi(request) && request.method === 'OPTIONS') {
      const headers = corsHeaders(request);
      return headers
        ? new Response(null, { status: 204, headers })
        : new Response(null, { status: 403 });
    }

    const response = await worker.fetch(request, env, ctx);
    if (!isPublicApi(request) || request.method !== 'GET') return response;

    const cors = corsHeaders(request);
    if (!cors) return response;

    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(cors)) headers.set(key, value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
