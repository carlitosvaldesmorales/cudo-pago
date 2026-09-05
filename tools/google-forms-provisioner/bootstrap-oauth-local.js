const http = require('http');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const REPO = 'carlitosvaldesmorales/cudo-pago';
const BRANCH = 'cudo-qa-auto-01';
const WORKFLOW = 'cudo-qa-forms-auto.yml';
const GOOGLE_CLIENT_ID = '257090036200-mr8qoeglsklm8peu9s8mp8r9dcdphab4.apps.googleusercontent.com';
const CALLBACK_HOST = '127.0.0.1';
const CALLBACK_PORT = 53682;
const CALLBACK_URL = `http://${CALLBACK_HOST}:${CALLBACK_PORT}`;
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/forms',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/script.projects',
  'https://www.googleapis.com/auth/script.deployments'
];

function fail(message) {
  console.error(`\nERROR: ${message}`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (result.error) fail(`${cmd}: ${result.error.message}`);
  return result;
}

function commandExists(cmd) {
  const result = run('sh', ['-lc', `command -v ${cmd}`]);
  return result.status === 0 && String(result.stdout || '').trim();
}

function base64url(buffer) {
  return buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function createPkce() {
  const verifier = base64url(crypto.randomBytes(64));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function openBrowser(url) {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const result = run(opener, args, { stdio: 'ignore' });
  if (result.status !== 0) {
    console.log('\nAbre manualmente esta URL en tu navegador:\n');
    console.log(url);
  }
}

function waitForOAuthCode(authUrl, expectedState) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, CALLBACK_URL);
        const oauthError = url.searchParams.get('error');
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');

        if (oauthError) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(`Google devolvió: ${oauthError}. Puedes cerrar esta ventana.`);
          server.close();
          reject(new Error(oauthError));
          return;
        }
        if (state !== expectedState) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Estado OAuth inválido. Puedes cerrar esta ventana.');
          server.close();
          reject(new Error('OAuth state mismatch'));
          return;
        }
        if (!code) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Esperando callback OAuth.');
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('CUDO OAuth autorizado correctamente. Puedes cerrar esta ventana y volver al Terminal.');
        server.close();
        resolve(code);
      } catch (err) {
        server.close();
        reject(err);
      }
    });

    server.on('error', reject);
    server.listen(CALLBACK_PORT, CALLBACK_HOST, () => {
      console.log(`Esperando autorización Google en ${CALLBACK_URL} ...`);
      openBrowser(authUrl);
    });
  });
}

async function exchangeCode(code, codeVerifier) {
  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: CALLBACK_URL
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Google token endpoint HTTP ${response.status}: ${data.error_description || data.error || 'error desconocido'}`);
  }
  return data;
}

function setGitHubSecret(name, value) {
  const result = run('gh', ['secret', 'set', name, '--repo', REPO, '--body', value], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    fail(`No pude cargar ${name} en GitHub: ${String(result.stderr || '').trim()}`);
  }
}

function verifyGitHubSecret(name) {
  const result = run('gh', ['secret', 'list', '--repo', REPO, '--json', 'name'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    fail(`No pude verificar GitHub Secrets: ${String(result.stderr || '').trim()}`);
  }
  let secrets;
  try {
    secrets = JSON.parse(String(result.stdout || '[]'));
  } catch (err) {
    fail(`Respuesta inválida al verificar GitHub Secrets: ${err.message}`);
  }
  if (!Array.isArray(secrets) || !secrets.some(item => item && item.name === name)) {
    fail(`${name} no aparece en GitHub Secrets después de cargarlo.`);
  }
}

function dispatchAndWatchWorkflow() {
  console.log('\n[CI] Disparando CUDO QA Forms Auto...');
  let result = run('gh', ['workflow', 'run', WORKFLOW, '--repo', REPO, '--ref', BRANCH], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    fail(`No pude disparar el workflow: ${String(result.stderr || '').trim()}`);
  }

  // Espera breve para que GitHub registre el workflow_dispatch y luego obtiene el run más reciente.
  run('sh', ['-lc', 'sleep 3']);
  result = run('gh', [
    'run', 'list', '--repo', REPO,
    '--workflow', WORKFLOW,
    '--branch', BRANCH,
    '--event', 'workflow_dispatch',
    '--limit', '1',
    '--json', 'databaseId',
    '--jq', '.[0].databaseId'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  if (result.status !== 0 || !String(result.stdout || '').trim()) {
    fail(`No pude obtener el run disparado: ${String(result.stderr || '').trim()}`);
  }

  const runId = String(result.stdout).trim();
  console.log(`[CI] Run ID: ${runId}`);
  console.log('[CI] Esperando resultado final...');

  result = run('gh', ['run', 'watch', runId, '--repo', REPO, '--exit-status'], {
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    console.error('\n[CI] Workflow falló. Mostrando logs fallidos:');
    run('gh', ['run', 'view', runId, '--repo', REPO, '--log-failed'], { stdio: 'inherit' });
    fail(`CUDO QA Forms Auto falló en el run ${runId}.`);
  }

  console.log(`\nOK: CUDO QA Forms Auto terminó SUCCESS. Run ${runId}.`);
}

async function main() {
  console.log('CUDO QA OAuth + cierre CI — ejecución única');
  console.log(`Repositorio: ${REPO}`);
  console.log(`Rama de trabajo: ${BRANCH}`);
  console.log('OAuth Client: cudo-os-desktop-sistemas / arke-cudo-core');

  if (!commandExists('gh')) {
    fail('GitHub CLI (gh) no está instalado. No se modificó nada.');
  }
  const authStatus = run('gh', ['auth', 'status'], { stdio: ['ignore', 'pipe', 'pipe'] });
  if (authStatus.status !== 0) {
    fail('GitHub CLI no está autenticado. Ejecuta "gh auth login" una vez y vuelve a ejecutar este cierre.');
  }

  const { verifier, challenge } = createPkce();
  const state = base64url(crypto.randomBytes(32));
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: CALLBACK_URL,
    response_type: 'code',
    scope: REQUIRED_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    login_hint: 'sistemas@cudo.cl'
  });
  const authUrl = `${AUTH_ENDPOINT}?${params.toString()}`;

  console.log('\n[1/4] Autorización Google');
  const code = await waitForOAuthCode(authUrl, state);
  const tokens = await exchangeCode(code, verifier);

  if (!tokens.refresh_token) {
    fail('Google no devolvió refresh_token. No se cargó ningún secreto en GitHub.');
  }

  console.log('[2/4] Cargando refresh token en GitHub Secrets');
  setGitHubSecret('CUDO_GOOGLE_REFRESH_TOKEN', tokens.refresh_token);

  console.log('[3/4] Verificando que GitHub registró el secreto');
  verifyGitHubSecret('CUDO_GOOGLE_REFRESH_TOKEN');
  console.log('OK: CUDO_GOOGLE_REFRESH_TOKEN existe en GitHub Secrets.');

  console.log('[4/4] Ejecutando y esperando CI completo');
  dispatchAndWatchWorkflow();

  console.log('\nCIERRE AUTOMÁTICO COMPLETADO.');
  console.log('OAuth cargado, secreto verificado y workflow ejecutado con resultado SUCCESS.');
}

main().catch(err => fail(err && err.message ? err.message : String(err)));
