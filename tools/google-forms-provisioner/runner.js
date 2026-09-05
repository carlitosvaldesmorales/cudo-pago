const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const REQUIRED_QA_KEYS = [
  'QA_NOTICIAS',
  'QA_EQUIPOS',
  'QA_PLANTEL',
  'QA_PARTIDOS',
  'QA_GALERIA'
];

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`${name} no está configurado`);
  }
  return String(value).trim();
}

async function buildOAuthClient() {
  const clientId = requiredEnv('CUDO_GOOGLE_OAUTH_CLIENT_ID');
  const refreshToken = requiredEnv('CUDO_GOOGLE_REFRESH_TOKEN');
  const body = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const token = await response.json();
  if (!response.ok || !token.access_token) {
    throw new Error(`No se pudo refrescar OAuth: HTTP ${response.status} ${token.error_description || token.error || 'error desconocido'}`);
  }

  const auth = new google.auth.OAuth2(clientId);
  auth.setCredentials({
    access_token: token.access_token,
    expiry_date: Date.now() + Number(token.expires_in || 3600) * 1000
  });
  return auth;
}

function loadAppsScriptFiles(baseDir) {
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.gs')) continue;
    const fullPath = path.join(baseDir, entry.name);
    files.push({
      name: path.basename(entry.name, '.gs'),
      type: 'SERVER_JS',
      source: fs.readFileSync(fullPath, 'utf8')
    });
  }

  const manifestPath = path.join(baseDir, 'appsscript.json');
  if (!fs.existsSync(manifestPath)) throw new Error('Falta appsscript.json');

  files.push({
    name: 'appsscript',
    type: 'JSON',
    source: fs.readFileSync(manifestPath, 'utf8')
  });

  if (files.length < 2) throw new Error('No se encontraron archivos Apps Script para publicar');
  return files;
}

function validateProvisionResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('provisionAllQA no devolvió un objeto de resultados');
  }

  const failures = [];
  for (const key of REQUIRED_QA_KEYS) {
    const item = result[key];
    if (!item || typeof item !== 'object') {
      failures.push(`${key}: resultado ausente`);
      continue;
    }
    if (item.ERROR) {
      failures.push(`${key}: ${item.ERROR}`);
      continue;
    }
    if (!item.FORM_ID || !item.FORM_RESPONDER_URL || !item.LINKED_SPREADSHEET_ID) {
      failures.push(`${key}: metadata incompleta`);
    }
  }

  if (failures.length) throw new Error(`Validación QA falló:\n${failures.join('\n')}`);
}

async function main() {
  const scriptId = requiredEnv('CUDO_APPS_SCRIPT_ID');
  const deploymentId = requiredEnv('CUDO_APPS_SCRIPT_DEPLOYMENT_ID');
  const baseDir = __dirname;
  const auth = await buildOAuthClient();
  const script = google.script({ version: 'v1', auth });
  const description = `CUDO QA auto ${process.env.GITHUB_SHA || new Date().toISOString()}`;

  console.log('[1/5] Validando proyecto e implementación existentes...');
  const project = await script.projects.get({ scriptId });
  if (project.data.scriptId !== scriptId) {
    throw new Error('El Script ID devuelto por Google no coincide con el configurado');
  }

  const deployment = await script.projects.deployments.get({ scriptId, deploymentId });
  const entryPoints = deployment.data.entryPoints || [];
  const hasExecutionApi = entryPoints.some(ep => ep.entryPointType === 'EXECUTION_API');
  if (!hasExecutionApi) throw new Error(`El deployment ${deploymentId} no es un API executable`);

  console.log('[2/5] Actualizando HEAD del Apps Script existente...');
  await script.projects.updateContent({
    scriptId,
    requestBody: { files: loadAppsScriptFiles(baseDir) }
  });

  console.log('[3/5] Creando versión inmutable y actualizando el deployment estable...');
  const version = await script.projects.versions.create({
    scriptId,
    requestBody: { description }
  });
  const versionNumber = version.data.versionNumber;
  if (!Number.isInteger(versionNumber)) throw new Error('Google no devolvió versionNumber al crear la versión');

  await script.projects.deployments.update({
    scriptId,
    deploymentId,
    requestBody: {
      deploymentConfig: {
        scriptId,
        versionNumber,
        manifestFileName: 'appsscript',
        description
      }
    }
  });

  console.log('[4/5] Ejecutando provisionAllQA mediante scripts.run...');
  const execution = await script.scripts.run({
    scriptId: deploymentId,
    requestBody: { function: 'provisionAllQA', devMode: false }
  });

  if (execution.data.error) {
    throw new Error(`scripts.run devolvió error: ${JSON.stringify(execution.data.error.details || [])}`);
  }

  const result = execution.data.response && execution.data.response.result;

  console.log('[5/5] Validando los cinco módulos QA...');
  validateProvisionResult(result);

  console.log(JSON.stringify({
    ok: true,
    scriptId,
    deploymentId,
    versionNumber,
    modules: REQUIRED_QA_KEYS,
    result
  }, null, 2));
}

main().catch(err => {
  const status = err && err.response && err.response.status;
  const data = err && err.response && err.response.data;
  console.error('CUDO QA Forms Auto ERROR:', status ? `HTTP ${status}` : '', data || err.message || err);
  process.exit(1);
});
