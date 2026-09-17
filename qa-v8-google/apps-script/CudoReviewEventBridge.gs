const CUDO_REVIEW_EVENT_BRIDGE = Object.freeze({
  spreadsheetId: '1KnC56IWf2hRxrGU4ksdO-JlzWyl2XJbhbOHKkdx4vms',
  handlerFunction: 'cudoReviewOnFormSubmit',
  tokenProperty: 'CUDO_GITHUB_ACTIONS_TOKEN',
  dispatchUrl: 'https://api.github.com/repos/carlitosvaldesmorales/cudo-pago/actions/workflows/cudo-review-engine.yml/dispatches',
  productionRef: 'main',
  syntheticQaRef: 'qa/review-event-no-prod-20260915',
  syntheticMarker: 'CUDO-QA-SYNTH-',
});

function cudoReviewDispatch_(source, targetRef) {
  const token = PropertiesService.getScriptProperties().getProperty(CUDO_REVIEW_EVENT_BRIDGE.tokenProperty);
  if (!token) {
    throw new Error('CUDO Review bridge: falta Script Property CUDO_GITHUB_ACTIONS_TOKEN');
  }

  const dispatchSource = String(source || 'unknown');
  const ref = String(targetRef || CUDO_REVIEW_EVENT_BRIDGE.productionRef);
  const response = UrlFetchApp.fetch(CUDO_REVIEW_EVENT_BRIDGE.dispatchUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    payload: JSON.stringify({
      ref: ref,
      inputs: {
        apply_changes: 'true',
        source: dispatchSource,
      },
    }),
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  if (code !== 200 && code !== 204) {
    throw new Error('CUDO Review bridge: GitHub dispatch HTTP ' + code + ' ' + response.getContentText().slice(0, 300));
  }

  return { ok: true, github_status: code, source: dispatchSource, ref: ref };
}

function cudoReviewEventValues_(e) {
  if (e && Array.isArray(e.values) && e.values.length) {
    return e.values.map(function(value) { return String(value == null ? '' : value); });
  }
  if (e && e.range && typeof e.range.getValues === 'function') {
    const rows = e.range.getValues();
    if (Array.isArray(rows) && rows.length) {
      return rows.reduce(function(acc, row) {
        return acc.concat((row || []).map(function(value) { return String(value == null ? '' : value); }));
      }, []);
    }
  }
  throw new Error('CUDO Review bridge: evento de formulario sin valores inspeccionables');
}

function cudoReviewTargetRef_(e) {
  const payload = cudoReviewEventValues_(e).join(' | ');
  return payload.indexOf(CUDO_REVIEW_EVENT_BRIDGE.syntheticMarker) !== -1
    ? CUDO_REVIEW_EVENT_BRIDGE.syntheticQaRef
    : CUDO_REVIEW_EVENT_BRIDGE.productionRef;
}

function cudoReviewOnFormSubmit(e) {
  if (!e || !e.range || !e.range.getSheet) {
    throw new Error('CUDO Review bridge: evento de formulario inválido');
  }

  const sheet = e.range.getSheet();
  const spreadsheet = sheet.getParent();
  if (!spreadsheet || spreadsheet.getId() !== CUDO_REVIEW_EVENT_BRIDGE.spreadsheetId) {
    return { ok: true, ignored: true, reason: 'OTHER_SPREADSHEET' };
  }

  const targetRef = cudoReviewTargetRef_(e);
  const dispatched = cudoReviewDispatch_('apps_script_form_submit', targetRef);
  return {
    ok: true,
    ignored: false,
    github_status: dispatched.github_status,
    source: dispatched.source,
    ref: dispatched.ref,
    synthetic_qa: targetRef === CUDO_REVIEW_EVENT_BRIDGE.syntheticQaRef,
  };
}

function cudoReviewEventBridgePing() {
  return cudoReviewDispatch_('agent_ping', CUDO_REVIEW_EVENT_BRIDGE.productionRef);
}

function installCudoReviewEventBridge() {
  const token = PropertiesService.getScriptProperties().getProperty(CUDO_REVIEW_EVENT_BRIDGE.tokenProperty);
  if (!token) {
    throw new Error('CUDO Review bridge: configura CUDO_GITHUB_ACTIONS_TOKEN antes de instalar el trigger');
  }

  const existing = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === CUDO_REVIEW_EVENT_BRIDGE.handlerFunction;
  });
  existing.forEach(function(trigger) {
    ScriptApp.deleteTrigger(trigger);
  });

  const trigger = ScriptApp.newTrigger(CUDO_REVIEW_EVENT_BRIDGE.handlerFunction)
    .forSpreadsheet(CUDO_REVIEW_EVENT_BRIDGE.spreadsheetId)
    .onFormSubmit()
    .create();

  return {
    ok: true,
    deleted_previous: existing.length,
    trigger_id: trigger.getUniqueId(),
  };
}

function cudoReviewEventBridgeStatus() {
  const properties = PropertiesService.getScriptProperties();
  const triggerCount = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === CUDO_REVIEW_EVENT_BRIDGE.handlerFunction;
  }).length;
  return {
    ok: true,
    token_configured: Boolean(properties.getProperty(CUDO_REVIEW_EVENT_BRIDGE.tokenProperty)),
    trigger_count: triggerCount,
    spreadsheet_id: CUDO_REVIEW_EVENT_BRIDGE.spreadsheetId,
    dispatch_url: CUDO_REVIEW_EVENT_BRIDGE.dispatchUrl,
    production_ref: CUDO_REVIEW_EVENT_BRIDGE.productionRef,
    synthetic_qa_ref: CUDO_REVIEW_EVENT_BRIDGE.syntheticQaRef,
    synthetic_marker: CUDO_REVIEW_EVENT_BRIDGE.syntheticMarker,
  };
}
