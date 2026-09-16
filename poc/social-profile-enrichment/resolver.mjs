const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

function cleanInput(value) {
  return String(value || '').trim();
}

function normalizeUrl(raw) {
  let value = cleanInput(raw);
  if (!value) return null;
  if (!/^https?:\/\//i.test(value) && /^(www\.)?(instagram|facebook)\.com\//i.test(value)) value = `https://${value}`;
  try {
    const u = new URL(value);
    u.hash = '';
    return u;
  } catch {
    return null;
  }
}

export function classifySocialReference(input, providerHint = '') {
  const raw = cleanInput(input);
  const hint = cleanInput(providerHint).toLowerCase();
  if (!raw) return { status: 'EMPTY', provider: null, kind: null, canonical_url: null, handle: null };

  if (raw.startsWith('@')) {
    const handle = raw.slice(1).trim();
    const provider = hint === 'facebook' ? 'facebook' : 'instagram';
    const canonical_url = provider === 'facebook'
      ? `https://www.facebook.com/${encodeURIComponent(handle)}`
      : `https://www.instagram.com/${encodeURIComponent(handle)}/`;
    return { status: 'REFERENCE_ONLY', provider, kind: 'profile', canonical_url, handle };
  }

  const u = normalizeUrl(raw);
  if (!u) return { status: 'INVALID', provider: hint || null, kind: null, canonical_url: null, handle: null };
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const parts = u.pathname.split('/').filter(Boolean);

  if (host === 'instagram.com') {
    if (['p', 'reel', 'tv'].includes(parts[0]) && parts[1]) {
      return { status: 'ENRICHABLE_PUBLIC_CONTENT', provider: 'instagram', kind: parts[0] === 'p' ? 'post' : parts[0], canonical_url: `https://www.instagram.com/${parts[0]}/${parts[1]}/`, handle: null };
    }
    if (parts[0] && !['stories','explore','accounts','direct','about','legal','developer','api','static','nametag','directory'].includes(parts[0])) {
      return { status: 'REFERENCE_ONLY', provider: 'instagram', kind: 'profile', canonical_url: `https://www.instagram.com/${parts[0]}/`, handle: parts[0] };
    }
  }

  if (host === 'facebook.com' || host === 'm.facebook.com') {
    const postIndex = parts.indexOf('posts');
    if (postIndex > 0 && parts[postIndex + 1]) {
      return { status: 'ENRICHABLE_PUBLIC_CONTENT', provider: 'facebook', kind: 'post', canonical_url: `https://www.facebook.com/${parts.slice(0, postIndex + 2).join('/')}/`, handle: parts[0] || null };
    }
    if (parts[0] === 'reel' && parts[1]) {
      return { status: 'ENRICHABLE_PUBLIC_CONTENT', provider: 'facebook', kind: 'reel', canonical_url: `https://www.facebook.com/reel/${parts[1]}/`, handle: null };
    }
    if (parts[0]) {
      return { status: 'REFERENCE_ONLY', provider: 'facebook', kind: 'profile', canonical_url: `https://www.facebook.com/${parts[0]}`, handle: parts[0] };
    }
  }

  return { status: 'UNSUPPORTED', provider: hint || null, kind: null, canonical_url: u.toString(), handle: null };
}

function extractOgImage(html) {
  const raw = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i.exec(html)?.[1]
    || /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html)?.[1]
    || null;
  return raw ? raw.replaceAll('&amp;', '&') : null;
}

export async function resolveSocialReference(input, providerHint = '') {
  const ref = classifySocialReference(input, providerHint);
  const base = { ...ref, enrichment_attempted: false, image_candidate: null, reason: null };

  if (ref.status !== 'ENRICHABLE_PUBLIC_CONTENT' || !ref.canonical_url) {
    return { ...base, reason: ref.status === 'REFERENCE_ONLY' ? 'PROFILE_REFERENCE_PRESERVED_NO_IMAGE_PROMISE' : ref.status };
  }

  const started = Date.now();
  try {
    const page = await fetch(ref.canonical_url, {
      redirect: 'follow',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'es-CL,es;q=0.9,en;q=0.8',
        'user-agent': MOBILE_UA,
      },
    });
    const html = await page.text();
    const candidate = extractOgImage(html);
    if (!page.ok || !candidate) {
      return { ...base, enrichment_attempted: true, reason: `NO_PUBLIC_IMAGE_CANDIDATE_HTTP_${page.status}`, elapsed_ms: Date.now() - started };
    }

    const image = await fetch(candidate, {
      redirect: 'follow',
      headers: { accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8', 'user-agent': MOBILE_UA },
    });
    const contentType = image.headers.get('content-type') || '';
    const bytes = Buffer.from(await image.arrayBuffer());
    if (!image.ok || !contentType.startsWith('image/') || bytes.length === 0) {
      return { ...base, enrichment_attempted: true, reason: `IMAGE_CANDIDATE_FETCH_FAILED_HTTP_${image.status}`, elapsed_ms: Date.now() - started };
    }

    return {
      ...base,
      enrichment_attempted: true,
      image_candidate: {
        source_url: candidate,
        content_type: contentType,
        bytes: bytes.length,
        source_host: new URL(candidate).host,
      },
      reason: 'PUBLIC_CONTENT_IMAGE_CANDIDATE_PASS',
      elapsed_ms: Date.now() - started,
    };
  } catch (error) {
    return { ...base, enrichment_attempted: true, reason: `NON_BLOCKING_ERROR:${error?.name || 'Error'}`, elapsed_ms: Date.now() - started };
  }
}
