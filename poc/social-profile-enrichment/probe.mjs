const cases = [
  { id: 'instagram_profile', provider: 'instagram', kind: 'profile', url: 'https://www.instagram.com/zuck/', endpoint: 'https://graph.facebook.com/v25.0/instagram_oembed' },
  { id: 'instagram_post', provider: 'instagram', kind: 'post', url: 'https://www.instagram.com/p/fA9uwTtkSN/', endpoint: 'https://graph.facebook.com/v25.0/instagram_oembed' },
  { id: 'facebook_profile', provider: 'facebook', kind: 'profile', url: 'https://www.facebook.com/kevinloveofficial', endpoint: 'https://graph.facebook.com/v25.0/oembed_page' },
  { id: 'facebook_post', provider: 'facebook', kind: 'post', url: 'https://www.facebook.com/kevinloveofficial/posts/pfbid0nWhZeiMVjzLHVjzR6QngXeVug8Nw4YxncbbZrquMu72r3HM8a73k55keRWiaWNLTl/', endpoint: 'https://graph.facebook.com/v25.0/oembed_post' },
];

function summarizeJson(data) {
  const html = typeof data?.html === 'string' ? data.html : '';
  return {
    keys: data && typeof data === 'object' ? Object.keys(data).sort() : [],
    provider_name: data?.provider_name || null,
    type: data?.type || null,
    html_length: html.length,
    has_thumbnail_url: Boolean(data?.thumbnail_url),
    has_author_name: Boolean(data?.author_name),
    html_has_img_tag: /<img\b/i.test(html),
    html_has_instagram_embed: /instagram-media|data-instgrm-permalink/i.test(html),
    html_has_facebook_embed: /fb-post|fb-video|facebook\.com/i.test(html),
  };
}

async function probeOembed(test) {
  const endpoint = new URL(test.endpoint);
  endpoint.searchParams.set('url', test.url);
  const started = Date.now();
  let response;
  let raw = '';
  try {
    response = await fetch(endpoint, {
      redirect: 'follow',
      headers: {
        accept: 'application/json',
        'user-agent': 'CUDO-QA-Social-Enrichment-Probe/1.0',
      },
    });
    raw = await response.text();
  } catch (error) {
    return { ok: false, transport_error: String(error), elapsed_ms: Date.now() - started };
  }
  let data = null;
  try { data = JSON.parse(raw); } catch {}
  return {
    ok: response.ok,
    http_status: response.status,
    content_type: response.headers.get('content-type'),
    elapsed_ms: Date.now() - started,
    json: data ? summarizeJson(data) : null,
    error_type: data?.error?.type || null,
    error_code: data?.error?.code ?? null,
    error_message: data?.error?.message || null,
    raw_length: raw.length,
  };
}

async function probePublicHtml(test) {
  const started = Date.now();
  let response;
  let html = '';
  try {
    response = await fetch(test.url, {
      redirect: 'follow',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'es-CL,es;q=0.9,en;q=0.8',
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      },
    });
    html = await response.text();
  } catch (error) {
    return { ok: false, transport_error: String(error), elapsed_ms: Date.now() - started };
  }
  const ogImage = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i.exec(html)?.[1]
    || /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html)?.[1]
    || null;
  return {
    ok: response.ok,
    http_status: response.status,
    final_url: response.url,
    content_type: response.headers.get('content-type'),
    elapsed_ms: Date.now() - started,
    html_length: html.length,
    has_og_image: Boolean(ogImage),
    og_image_host: ogImage ? (() => { try { return new URL(ogImage.replaceAll('&amp;', '&')).host; } catch { return null; } })() : null,
    login_wall_signal: /log in|iniciar sesi[oó]n|accounts\/login/i.test(html),
  };
}

const results = [];
for (const test of cases) {
  const oembed = await probeOembed(test);
  const public_html = await probePublicHtml(test);
  let classification = 'NO_USEFUL_ENRICHMENT';
  if (oembed.ok && oembed.json?.has_thumbnail_url) classification = 'IMAGE_CANDIDATE_FROM_OEMBED';
  else if (public_html.ok && public_html.has_og_image) classification = 'IMAGE_CANDIDATE_FROM_PUBLIC_HTML_EXPERIMENTAL';
  else if (oembed.ok && oembed.json?.html_length > 0) classification = 'EMBED_ONLY_NO_DIRECT_IMAGE';
  results.push({ ...test, oembed, public_html, classification });
}

const output = {
  timestamp: new Date().toISOString(),
  scope: 'QA_ONLY_PUBLIC_EXAMPLES',
  production_v8_touched: false,
  user_oauth_required: false,
  access_token_used: false,
  cases: results,
};

console.log(JSON.stringify(output, null, 2));
