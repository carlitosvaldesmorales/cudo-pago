const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');
const { google } = require('googleapis');

const REPO = 'carlitosvaldesmorales/cudo-pago';
const BRANCH = 'cudo-qa-auto-01';
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

function findOAuthClient() {
  const explicit = process.env.CUDO_GOOGLE_OAUTH_CLIENT_FILE;
  const candidates = [];
  if (explicit) candidates.push(path.resolve(explicit));

  const homes = [
    process.env.ARKE_OS_ROOT,
    path.join(process.env.HOME || '', 'meta-arke'),
    path.join(process.env.HOME || '', 'arke-os-root')
  ].filter(Boolean);

  for (const root of homes) {
    const secretsDir = path.join(root, 'arke-os-runtime', 'secrets');
    const prereqsPath = path.join(secretsDir, 'prereqs.json');
    let configuredName = 'google_oauth_client.json';
    try {
      if (fs.existsSync(prereqsPath)) {
        const prereqs = JSON.parse(fs.readFileSync(prereqsPath, 'utf8'));
        configuredName = prereqs.GOOGLE_OAUTH_CLIENT_FILE || configuredName;
      }
    } catch (_) {}
    candidates.push(path.join(secretsDir, configuredName));
    candidates.push(path.join(secretsDir, 'google_oauth_client.json'));
  }

  for (const candidate of [...new Set(candidates)]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function readClient(file) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    fail(`No pude leer el OAuth Client en ${file}: ${err.message}`);
  }
  const credentials = data.installed || data.web;
  if (!credentials || !credentials.client_id || !credentials.client_secret) {
    fail('El archivo OAuth no contiene credenciales installed/web válidas.');
  }
  return { data, credentials };
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

function waitForOAuthCode(authUrl) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, CALLBACK_URL);
        const oauthError = url.searchParams.get('error');
        const code = url.searchParams.get('code');
        if (oauthError) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(`Google devolvió: ${oauthError}. Puedes cerrar esta ventana.`);
          server.close();
          reject(new Error(oauthError));
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

function setGitHubSecret(name, value) {
  const result = run('gh', ['secret', 'set', name, '--repo', REPO, '--body', value], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    fail(`No pude cargar ${name} en GitHub: ${String(result.stderr || '').trim()}`);
  }
}

async function main() {
  console.log('CUDO QA OAuth bootstrap — ejecución única');
  console.log(`Repositorio: ${REPO}`);
  console.log(`Rama de trabajo: ${BRANCH}`);

  if (!commandExists('gh')) {
    fail('GitHub CLI (gh) no está instalado. No se modificó nada.');
  }
  const authStatus = run('gh', ['auth', 'status'], { stdio: ['ignore', 'pipe', 'pipe'] });
  if (authStatus.status !== 0) {
    fail('GitHub CLI no está autenticado. Ejecuta "gh auth login" una vez y vuelve a ejecutar este bootstrap.');
  }

  const clientFile = findOAuthClient();
  if (!clientFile) {
    fail('No encontré el OAuth Client existente de CUDO-OS. No se modificó nada.');
  }
  console.log(`OAuth Client encontrado: ${clientFile}`);

  const { data: clientData, credentials } = readClient(clientFile);
  const auth = new google.auth.OAuth2(credentials.client_id, credentials.client_secret, CALLBACK_URL);
  const authUrl = auth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: REQUIRED_SCOPES
  });

  console.log('\nSe abrirá Google para una autorización única con estos permisos:');
  for (const scope of REQUIRED_SCOPES) console.log(` - ${scope}`);

  const code = await waitForOAuthCode(authUrl);
  const { tokens } = await auth.getToken(code);
  if (!tokens.refresh_token) {
    fail('Google no devolvió refresh_token. No se cargaron secretos en GitHub.');
  }

  // Guardamos el JSON completo del cliente porque el runner actual espera el mismo
  // formato que CUDO-OS. Los valores nunca se imprimen en pantalla.
  setGitHubSecret('CUDO_GOOGLE_OAUTH_CLIENT_JSON', JSON.stringify(clientData));
  setGitHubSecret('CUDO_GOOGLE_OAUTH_TOKENS_JSON', JSON.stringify(tokens));

  console.log('\nOK: OAuth cargado en GitHub Secrets sin mostrar credenciales.');
  console.log('No se modificaron ni reemplazaron los tokens históricos de CUDO-OS.');
  console.log('Siguiente paso: ejecutar el workflow CUDO QA Forms Auto y certificar los cinco módulos QA.');
}

main().catch(err => fail(err && err.message ? err.message : String(err)));
