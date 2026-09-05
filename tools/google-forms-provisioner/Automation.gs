const CUDO_QA_AUTOMATION = {
  tokenProperty: 'CUDO_QA_AUTOMATION_TOKEN',
  allowedAction: 'provisionAllQA'
};

function doGet() {
  return jsonResponse_({
    ok: true,
    service: 'CUDO_QA_FORMS_AUTOMATION',
    status: 'READY',
    timestamp: new Date().toISOString()
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return jsonResponse_({ ok: false, error: 'LOCKED' });
  }

  try {
    const payload = parseAutomationPayload_(e);
    const expectedToken = PropertiesService.getScriptProperties().getProperty(CUDO_QA_AUTOMATION.tokenProperty);

    if (!expectedToken) {
      return jsonResponse_({ ok: false, error: 'AUTOMATION_TOKEN_NOT_CONFIGURED' });
    }
    if (!payload.token || payload.token !== expectedToken) {
      return jsonResponse_({ ok: false, error: 'UNAUTHORIZED' });
    }
    if (payload.action !== CUDO_QA_AUTOMATION.allowedAction) {
      return jsonResponse_({ ok: false, error: 'ACTION_NOT_ALLOWED' });
    }

    const result = provisionAllQA();
    return jsonResponse_({
      ok: true,
      action: payload.action,
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse_({
      ok: false,
      error: String(err && err.message ? err.message : err),
      timestamp: new Date().toISOString()
    });
  } finally {
    lock.releaseLock();
  }
}

function configureAutomationToken(token) {
  const value = String(token || '').trim();
  if (value.length < 32) {
    throw new Error('El token de automatización debe tener al menos 32 caracteres.');
  }
  PropertiesService.getScriptProperties().setProperty(CUDO_QA_AUTOMATION.tokenProperty, value);
  return 'CUDO_QA_AUTOMATION_TOKEN configurado';
}

function automationHealthcheck() {
  return {
    tokenConfigured: Boolean(PropertiesService.getScriptProperties().getProperty(CUDO_QA_AUTOMATION.tokenProperty)),
    allowedAction: CUDO_QA_AUTOMATION.allowedAction,
    timestamp: new Date().toISOString()
  };
}

function parseAutomationPayload_(e) {
  if (!e) return {};
  if (e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (_) {}
  }
  return e.parameter || {};
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
