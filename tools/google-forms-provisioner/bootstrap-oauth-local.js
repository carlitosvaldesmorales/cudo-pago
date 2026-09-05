const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');
const { google } = require('googleapis');

const REPO = 'carlitosvaldesmorales/cudo-pago';
const BRANCH = 'cudo-qa-auto-01';
const WORKFLOW = 'cudo-qa-forms-auto.yml';
const CALLBACK_HOST = '127.0.0.1';
const CALLBACK_PORT = 53682;
const CALLBACK_URL = `http://${CALLBACK_HOST}:${CALLBACK_PORT}`;
const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/forms',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/script.projects',
  'https://www.googleapis.com/auth/script.deployments'
];

function fail(message) { console.error(`\nERROR: ${message}`); process.exit(1); }
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.error) fail(`${cmd}: ${r.error.message}`);
  return r;
}
function commandExists(cmd) { return run('sh', ['-lc', `command -v ${cmd}`]).status === 0; }
function openBrowser(url) {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const r = run(opener, args, { stdio: 'ignore' });
  if (r.status !== 0) console.log(`\nAbre manualmente esta URL:\n${url}`);
}
function resolveCredentialsFile() {
  const explicit = process.env.CUDO_GOOGLE_OAUTH_CLIENT_FILE || process.argv[2];
  if (explicit) return path.resolve(explicit);
  const downloads = path.join(process.env.HOME || '', 'Downloads');
  if (!fs.existsSync(downloads)) return null;
  const candidates = fs.readdirSync(downloads)
    .filter(n => /^client_secret_.*\.json$/i.test(n) || /^credentials.*\.json$/i.test(n))
    .map(n => ({ p: path.join(downloads, n), m: fs.statSync(path.join(downloads, n)).mtimeMs }))
    .sort((a,b) => b.m-a.m);
  return candidates.length ? candidates[0].p : null;
}
function readCredentials(file) {
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { fail(`No pude leer ${file}: ${e.message}`); }
  const c = data.installed || data.web;
  if (!c || !c.client_id || !c.client_secret) fail('El JSON no contiene client_id/client_secret válidos.');
  return c;
}
function waitForCode(authUrl) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req,res) => {
      try {
        const u = new URL(req.url, CALLBACK_URL);
        const err = u.searchParams.get('error');
        const code = u.searchParams.get('code');
        if (err) { res.end(`Google devolvió ${err}.`); server.close(); reject(new Error(err)); return; }
        if (!code) { res.statusCode=404; res.end('Esperando OAuth.'); return; }
        res.end('CUDO OAuth autorizado correctamente. Puedes cerrar esta ventana y volver al Terminal.');
        server.close(); resolve(code);
      } catch(e) { server.close(); reject(e); }
    });
    server.on('error', reject);
    server.listen(CALLBACK_PORT, CALLBACK_HOST, () => {
      console.log(`[1/5] Esperando autorización Google en ${CALLBACK_URL} ...`);
      openBrowser(authUrl);
    });
  });
}
function setSecret(name, value) {
  const r = run('gh', ['secret','set',name,'--repo',REPO,'--body',value], { stdio:['ignore','pipe','pipe'] });
  if (r.status !== 0) fail(`No pude cargar ${name}: ${String(r.stderr||'').trim()}`);
}
function verifySecrets() {
  const r = run('gh', ['secret','list','--repo',REPO,'--json','name'], { stdio:['ignore','pipe','pipe'] });
  if (r.status !== 0) fail(`No pude verificar GitHub Secrets: ${String(r.stderr||'').trim()}`);
  const names = JSON.parse(r.stdout || '[]').map(x=>x.name);
  for (const n of ['CUDO_GOOGLE_OAUTH_CLIENT_ID','CUDO_GOOGLE_OAUTH_CLIENT_SECRET','CUDO_GOOGLE_REFRESH_TOKEN']) {
    if (!names.includes(n)) fail(`GitHub no confirmó el secreto ${n}`);
  }
}
function triggerAndWait() {
  console.log('[4/5] Disparando workflow CUDO QA Forms Auto...');
  let r = run('gh', ['workflow','run',WORKFLOW,'--repo',REPO,'--ref',BRANCH], { stdio:['ignore','pipe','pipe'] });
  if (r.status !== 0) fail(`No pude disparar workflow: ${String(r.stderr||'').trim()}`);
  run('sh',['-lc','sleep 3']);
  r = run('gh', ['run','list','--repo',REPO,'--workflow',WORKFLOW,'--branch',BRANCH,'--event','workflow_dispatch','--limit','1','--json','databaseId','--jq','.[0].databaseId'], { stdio:['ignore','pipe','pipe'] });
  if (r.status !== 0 || !String(r.stdout||'').trim()) fail(`No pude localizar el workflow recién disparado: ${String(r.stderr||'').trim()}`);
  const runId = String(r.stdout).trim();
  console.log(`[CI] Run ID: ${runId}`);
  r = run('gh', ['run','watch',runId,'--repo',REPO,'--exit-status'], { stdio:'inherit' });
  if (r.status !== 0) {
    console.error('\n--- LOGS DEL FALLO ---');
    run('gh', ['run','view',runId,'--repo',REPO,'--log-failed'], { stdio:'inherit' });
    fail(`Workflow ${runId} terminó con error.`);
  }
  return runId;
}

async function main() {
  console.log('CUDO QA OAuth + CI — bootstrap único y cierre completo');
  if (!commandExists('gh')) fail('GitHub CLI (gh) no está instalado.');
  if (run('gh',['auth','status'],{stdio:['ignore','pipe','pipe']}).status !== 0) fail('GitHub CLI no está autenticado.');

  const file = resolveCredentialsFile();
  if (!file || !fs.existsSync(file)) {
    fail('Falta el JSON OAuth descargado desde Google Auth Platform. Descárgalo y vuelve a ejecutar este mismo comando; el script lo detectará en Downloads automáticamente.');
  }
  console.log(`OAuth JSON detectado: ${file}`);
  const c = readCredentials(file);
  const auth = new google.auth.OAuth2(c.client_id, c.client_secret, CALLBACK_URL);
  const authUrl = auth.generateAuthUrl({ access_type:'offline', prompt:'consent', scope:REQUIRED_SCOPES, login_hint:'sistemas@cudo.cl' });
  const code = await waitForCode(authUrl);
  const { tokens } = await auth.getToken(code);
  if (!tokens.refresh_token) fail('Google no devolvió refresh_token.');

  console.log('[2/5] Cargando credenciales en GitHub Secrets...');
  setSecret('CUDO_GOOGLE_OAUTH_CLIENT_ID', c.client_id);
  setSecret('CUDO_GOOGLE_OAUTH_CLIENT_SECRET', c.client_secret);
  setSecret('CUDO_GOOGLE_REFRESH_TOKEN', tokens.refresh_token);

  console.log('[3/5] Verificando secretos en GitHub...');
  verifySecrets();
  const runId = triggerAndWait();
  console.log(`[5/5] CIERRE AUTOMÁTICO COMPLETADO. Workflow ${runId}: SUCCESS.`);
}

main().catch(e => fail(e && e.message ? e.message : String(e)));
