import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const PORT = Number(process.env.PORT || 19110);
const APP_ID = process.env.CUDO_META_APP_ID || '';
const APP_SECRET = process.env.CUDO_META_APP_SECRET || '';
const API_VERSION = process.env.CUDO_META_API_VERSION || 'v26.0';
const BASE_PATH = `/${(process.env.CUDO_POC_KEY || 'cudo-poc').replace(/[^a-zA-Z0-9_-]/g, '')}`;
const STORAGE_DIR = process.env.CUDO_POC_STORAGE || path.join(process.cwd(), '.poc-storage');
const configured = Boolean(APP_ID && APP_SECRET);
const oauthStates = new Map();
const reviews = new Map();

await fs.mkdir(path.join(STORAGE_DIR, 'selected'), { recursive: true });

const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const random = () => crypto.randomBytes(24).toString('hex');
const nowIso = () => new Date().toISOString();
const hostBase = (req) => `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['x-forwarded-host'] || req.headers.host}`;

function page(title, body) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#f4f2ed;color:#03163d;margin:0}.wrap{max-width:820px;margin:auto;padding:28px 18px}.card{background:white;border:1px solid #d5d9e2;border-radius:18px;padding:20px;margin:14px 0;box-shadow:0 8px 24px #03163d12}.btn{display:inline-block;background:#03163d;color:white;border:0;border-radius:12px;padding:13px 16px;text-decoration:none;font-weight:800;cursor:pointer}.warn{border-left:5px solid #c89d00}.ok{border-left:5px solid #17833e}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}.photo{border:1px solid #d5d9e2;border-radius:14px;padding:8px;background:#fff}.photo img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:10px}.muted{color:#5a667a;font-size:14px}.small{font-size:12px;color:#5a667a}</style></head><body><div class="wrap"><h1>${esc(title)}</h1>${body}</div></body></html>`;
}

function send(res, status, type, body) {
  res.writeHead(status, {'content-type': `${type}; charset=utf-8`, 'cache-control':'no-store', 'referrer-policy':'no-referrer'});
  res.end(body);
}

async function readForm(req) {
  let raw='';
  for await (const chunk of req) raw += chunk;
  return Object.fromEntries(new URLSearchParams(raw));
}

async function graph(pathname, token) {
  const u = new URL(`https://graph.facebook.com/${API_VERSION}/${pathname}`);
  u.searchParams.set('access_token', token);
  const r = await fetch(u, {headers:{accept:'application/json'}});
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = {raw:text}; }
  if (!r.ok || data?.error) throw new Error(`Graph ${r.status}: ${JSON.stringify(data?.error || data)}`);
  return data;
}

function cleanExpired() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [k,v] of oauthStates) if (v.created < cutoff) oauthStates.delete(k);
  for (const [k,v] of reviews) if (v.created < cutoff) reviews.delete(k);
}
setInterval(cleanExpired, 60_000).unref();

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (u.pathname === '/health') {
      return send(res, 200, 'application/json', JSON.stringify({status:'ok', configured, api_version:API_VERSION, pid:process.pid, uptime_s:Math.round(process.uptime()), memory:process.memoryUsage(), timestamp:nowIso()}));
    }
    if (u.pathname === BASE_PATH || u.pathname === `${BASE_PATH}/`) {
      const body = configured
        ? `<div class="card ok"><strong>PoC lista para autorización real.</strong><p class="muted">No toca V8 productivo. Los tokens viven sólo en memoria durante la prueba.</p><a class="btn" href="${BASE_PATH}/login">Continuar con Facebook</a></div>`
        : `<div class="card warn"><strong>PoC materializada, falta credencial Meta.</strong><p class="muted">Se requieren CUDO_META_APP_ID y CUDO_META_APP_SECRET para ejecutar el OAuth real. El servidor y la ruta de revisión ya están operativos.</p></div>`;
      return send(res, 200, 'text/html', page('CUDO · PoC foto desde Facebook', body));
    }
    if (u.pathname === `${BASE_PATH}/login`) {
      if (!configured) return send(res, 503, 'text/html', page('Meta no configurado','<div class="card warn">Faltan credenciales de una App Meta de prueba.</div>'));
      const state = random();
      const callback = `${hostBase(req)}${BASE_PATH}/callback`;
      oauthStates.set(state, {created:Date.now(), callback});
      const auth = new URL(`https://www.facebook.com/${API_VERSION}/dialog/oauth`);
      auth.searchParams.set('client_id', APP_ID);
      auth.searchParams.set('redirect_uri', callback);
      auth.searchParams.set('state', state);
      auth.searchParams.set('response_type', 'code');
      auth.searchParams.set('scope', 'public_profile,user_photos');
      res.writeHead(302, {location:auth.toString(),'cache-control':'no-store'}); return res.end();
    }
    if (u.pathname === `${BASE_PATH}/callback`) {
      if (!configured) throw new Error('Meta no configurado');
      const code = u.searchParams.get('code');
      const state = u.searchParams.get('state');
      const saved = state && oauthStates.get(state);
      if (!code || !saved) return send(res, 400, 'text/html', page('Autorización inválida','<div class="card warn">No se recibió un código OAuth válido o el estado expiró.</div>'));
      oauthStates.delete(state);
      const tokenUrl = new URL(`https://graph.facebook.com/${API_VERSION}/oauth/access_token`);
      tokenUrl.searchParams.set('client_id', APP_ID);
      tokenUrl.searchParams.set('client_secret', APP_SECRET);
      tokenUrl.searchParams.set('redirect_uri', saved.callback);
      tokenUrl.searchParams.set('code', code);
      const tr = await fetch(tokenUrl);
      const tj = await tr.json();
      if (!tr.ok || !tj.access_token) throw new Error(`Token exchange ${tr.status}: ${JSON.stringify(tj)}`);
      const token = tj.access_token;
      const me = await graph('me?fields=id,name,picture.width(320).height(320)', token);
      const photos = await graph('me/photos?type=uploaded&fields=id,name,images,created_time&limit=24', token);
      const reviewId = random();
      reviews.set(reviewId, {created:Date.now(), user:{id:me.id,name:me.name,picture:me.picture?.data?.url || ''}, photos:photos.data || []});
      const cards = [];
      if (me.picture?.data?.url) cards.push({id:'profile', label:'Foto de perfil', url:me.picture.data.url});
      for (const p of (photos.data || [])) {
        const src = Array.isArray(p.images) && p.images.length ? p.images[0].source : '';
        if (src) cards.push({id:p.id, label:p.name || 'Foto subida', url:src});
      }
      reviews.get(reviewId).candidates = cards;
      const html = cards.length ? cards.map((p,i)=>`<form class="photo" method="post" action="${BASE_PATH}/select"><img src="${esc(p.url)}" alt="Foto candidata"><input type="hidden" name="review" value="${reviewId}"><input type="hidden" name="idx" value="${i}"><p class="small">${esc(p.label)}</p><button class="btn" type="submit">Usar esta foto</button></form>`).join('') : '<div class="card warn">Facebook autorizó la cuenta, pero no devolvió fotografías utilizables con los permisos actuales.</div>';
      return send(res, 200, 'text/html', page(`Elegir foto · ${me.name}`, `<div class="card"><p>Facebook devolvió <strong>${cards.length}</strong> candidata(s). Elige una para demostrar la copia al servidor QA.</p></div><div class="grid">${html}</div>`));
    }
    if (u.pathname === `${BASE_PATH}/select` && req.method === 'POST') {
      const form = await readForm(req);
      const review = reviews.get(form.review);
      const idx = Number(form.idx);
      const candidate = review?.candidates?.[idx];
      if (!review || !candidate) return send(res, 400, 'text/html', page('Selección inválida','<div class="card warn">La sesión expiró o la foto no existe.</div>'));
      const ir = await fetch(candidate.url, {headers:{'user-agent':'CUDO-Facebook-Photo-PoC/1.0'}});
      if (!ir.ok) throw new Error(`Image download ${ir.status}`);
      const bytes = Buffer.from(await ir.arrayBuffer());
      const safeUser = String(review.user.id || 'user').replace(/[^0-9A-Za-z_-]/g,'');
      const filename = `${Date.now()}-${safeUser}.jpg`;
      const target = path.join(STORAGE_DIR, 'selected', filename);
      await fs.writeFile(target, bytes, {mode:0o600});
      await fs.writeFile(`${target}.json`, JSON.stringify({selected_at:nowIso(), facebook_user_id:review.user.id, facebook_name:review.user.name, candidate_id:candidate.id, bytes:bytes.length}, null, 2), {mode:0o600});
      reviews.delete(form.review);
      return send(res, 200, 'text/html', page('PoC PASS', `<div class="card ok"><strong>Foto copiada al servidor QA.</strong><p>Usuario: ${esc(review.user.name)}</p><p>Archivo: ${esc(filename)}</p><p>Tamaño: ${bytes.length} bytes</p><p class="muted">No se publicó nada en CUDO V8.</p></div>`));
    }
    return send(res, 404, 'text/plain', 'Not found');
  } catch (err) {
    console.error(err);
    return send(res, 500, 'text/html', page('PoC error', `<div class="card warn"><strong>La prueba llegó a un error real.</strong><pre>${esc(err.message)}</pre></div>`));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(JSON.stringify({event:'listen',port:PORT,configured,base_path:BASE_PATH,storage:STORAGE_DIR,timestamp:nowIso()}));
});
