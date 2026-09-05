const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const REQUIRED_QA_KEYS = ['QA_NOTICIAS','QA_EQUIPOS','QA_PLANTEL','QA_PARTIDOS','QA_TABLA','QA_GALERIA'];

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) throw new Error(`${name} no está configurado`);
  return String(value).trim();
}

function buildOAuthClient() {
  const clientId = requiredEnv('CUDO_GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = requiredEnv('CUDO_GOOGLE_OAUTH_CLIENT_SECRET');
  const refreshToken = requiredEnv('CUDO_GOOGLE_REFRESH_TOKEN');
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return auth;
}

function loadAppsScriptFiles(baseDir) {
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.gs')) continue;
    files.push({
      name: path.basename(entry.name, '.gs'),
      type: 'SERVER_JS',
      source: fs.readFileSync(path.join(baseDir, entry.name), 'utf8')
    });
  }
  const manifestPath = path.join(baseDir, 'appsscript.json');
  if (!fs.existsSync(manifestPath)) throw new Error('Falta appsscript.json');
  files.push({ name: 'appsscript', type: 'JSON', source: fs.readFileSync(manifestPath, 'utf8') });
  if (files.length < 2) throw new Error('No se encontraron archivos Apps Script para publicar');
  return files;
}

function hasExecutionApi(deployment) {
  return (deployment?.entryPoints || []).some(ep => ep.entryPointType === 'EXECUTION_API');
}

function validateProvisionResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('provisionAllQA no devolvió un objeto de resultados');
  }
  const failures = [];
  for (const key of REQUIRED_QA_KEYS) {
    const item = result[key];
    if (!item || typeof item !== 'object') { failures.push(`${key}: resultado ausente`); continue; }
    if (item.ERROR) { failures.push(`${key}: ${item.ERROR}`); continue; }
    if (!item.FORM_ID || !item.FORM_RESPONDER_URL || !item.LINKED_SPREADSHEET_ID) {
      failures.push(`${key}: metadata incompleta`);
    }
  }
  if (failures.length) throw new Error(`Validación QA falló:\n${failures.join('\n')}`);
}

async function resolveExecutableDeployment(script, scriptId, preferredId, versionNumber, description) {
  const listed = await script.projects.deployments.list({ scriptId });
  const deployments = listed.data.deployments || [];
  let selected = null;

  if (preferredId) selected = deployments.find(d => d.deploymentId === preferredId && hasExecutionApi(d)) || null;
  if (!selected) selected = deployments.find(hasExecutionApi) || null;

  if (selected) {
    await script.projects.deployments.update({
      scriptId,
      deploymentId: selected.deploymentId,
      requestBody: { deploymentConfig: { scriptId, versionNumber, manifestFileName: 'appsscript', description } }
    });
    const refreshed = await script.projects.deployments.get({ scriptId, deploymentId: selected.deploymentId });
    if (!hasExecutionApi(refreshed.data)) throw new Error(`Deployment ${selected.deploymentId} perdió EXECUTION_API al actualizarse`);
    return refreshed.data;
  }

  console.log('No existe un deployment EXECUTION_API válido; creando uno nuevo desde el manifest versionado...');
  const created = await script.projects.deployments.create({
    scriptId,
    requestBody: { versionNumber, manifestFileName: 'appsscript', description }
  });
  if (!created.data.deploymentId) throw new Error('Google no devolvió deploymentId al crear la implementación');
  const refreshed = await script.projects.deployments.get({ scriptId, deploymentId: created.data.deploymentId });
  if (!hasExecutionApi(refreshed.data)) {
    throw new Error(`Google creó deployment ${created.data.deploymentId} pero no lo expuso como EXECUTION_API`);
  }
  return refreshed.data;
}

async function main() {
  const scriptId = requiredEnv('CUDO_APPS_SCRIPT_ID');
  const preferredDeploymentId = String(process.env.CUDO_APPS_SCRIPT_DEPLOYMENT_ID || '').trim();
  const auth = buildOAuthClient();
  const script = google.script({ version: 'v1', auth });
  const description = `CUDO QA auto ${process.env.GITHUB_SHA || new Date().toISOString()}`;

  console.log('[1/5] Validando proyecto Apps Script...');
  const project = await script.projects.get({ scriptId });
  if (project.data.scriptId !== scriptId) throw new Error('El Script ID devuelto por Google no coincide con el configurado');

  console.log('[2/5] Actualizando HEAD del Apps Script existente...');
  await script.projects.updateContent({ scriptId, requestBody: { files: loadAppsScriptFiles(__dirname) } });

  console.log('[3/5] Creando versión inmutable y resolviendo deployment API executable...');
  const version = await script.projects.versions.create({ scriptId, requestBody: { description } });
  const versionNumber = version.data.versionNumber;
  if (!Number.isInteger(versionNumber)) throw new Error('Google no devolvió versionNumber');
  const deployment = await resolveExecutableDeployment(script, scriptId, preferredDeploymentId, versionNumber, description);
  const deploymentId = deployment.deploymentId;

  console.log('[4/5] Ejecutando provisionAllQA...');
  const execution = await script.scripts.run({
    scriptId: deploymentId,
    requestBody: { function: 'provisionAllQA', devMode: false }
  });
  if (execution.data.error) throw new Error(`scripts.run devolvió error: ${JSON.stringify(execution.data.error.details || [])}`);

  const result = execution.data.response && execution.data.response.result;
  console.log('[5/5] Validando los seis módulos visibles de V8...');
  validateProvisionResult(result);
  console.log(JSON.stringify({ ok: true, scriptId, deploymentId, versionNumber, modules: REQUIRED_QA_KEYS, result }, null, 2));
}

main().catch(err => {
  const status = err && err.response && err.response.status;
  const data = err && err.response && err.response.data;
  console.error('CUDO QA Forms Auto ERROR:', status ? `HTTP ${status}` : '', data || err.message || err);
  process.exit(1);
});
