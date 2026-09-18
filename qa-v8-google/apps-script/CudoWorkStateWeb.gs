const CUDO_WORK_STATE_SHEET_ID_='1BEb1eIpJhcVb7WzaSQ7J_YzbjOhzIyPfcb8lLAIJPvw';
const CUDO_WORK_CONTROL_SHEET_='WORK_CONTROL';
const CUDO_WORK_REQUESTS_SHEET_='WORK_STATE_REQUESTS';
const CUDO_WORK_ALLOWED_REVIEWER_='sistemas@cudo.cl';

function cudoWorkEsc_(v){
  return String(v==null?'':v).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function cudoWorkReviewer_(){
  const active=String(Session.getActiveUser().getEmail()||'').toLowerCase();
  const effective=String(Session.getEffectiveUser().getEmail()||'').toLowerCase();
  const email=active||effective;
  if(email!==CUDO_WORK_ALLOWED_REVIEWER_) throw new Error('Acceso no autorizado.');
  return email;
}
function cudoWorkRows_(){
  const sh=SpreadsheetApp.openById(CUDO_WORK_STATE_SHEET_ID_).getSheetByName(CUDO_WORK_CONTROL_SHEET_);
  if(!sh) throw new Error('WORK_CONTROL no existe');
  const values=sh.getDataRange().getDisplayValues();
  if(values.length<2) return [];
  const h=values[0].map(function(v){return String(v||'').trim();});
  return values.slice(1).map(function(r,i){
    const obj={__row:i+2};
    h.forEach(function(x,j){obj[x]=String(r[j]||'').trim();});
    return obj;
  }).filter(function(r){return r.WORK_ID;});
}
function cudoWorkStableRequestId_(payload){
  const bytes=Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(payload),
    Utilities.Charset.UTF_8
  );
  const hex=bytes.map(function(b){
    return ('0'+((b<0?b+256:b).toString(16))).slice(-2);
  }).join('').slice(0,16).toUpperCase();
  return 'CUDO-WORK-REQ-'+hex;
}
function cudoWorkActions_(state){
  if(state==='OPEN') return [['START','Iniciar'],['BLOCK','Bloquear'],['CANCEL','Cancelar']];
  if(state==='IN_PROGRESS') return [['COMPLETE','Completar'],['BLOCK','Bloquear'],['WAIT_EXTERNAL','Esperar externo'],['CANCEL','Cancelar']];
  if(state==='BLOCKED') return [['REOPEN','Reabrir'],['START','Retomar'],['CANCEL','Cancelar']];
  if(state==='WAITING_EXTERNAL') return [['REOPEN','Reabrir'],['BLOCK','Bloquear'],['CANCEL','Cancelar']];
  return [];
}
function cudoWorkRender_(message){
  const reviewer=cudoWorkReviewer_();
  const rows=cudoWorkRows_();
  const cards=rows.map(function(r){
    const actions=cudoWorkActions_(r.STATE).map(function(a){
      return '<button name="action" value="'+cudoWorkEsc_(a[0])+'">'+cudoWorkEsc_(a[1])+'</button>';
    }).join('');
    const form=actions
      ? '<form method="post">'+
        '<input type="hidden" name="kind" value="WORK_ITEM">'+
        '<input type="hidden" name="work_id" value="'+cudoWorkEsc_(r.WORK_ID)+'">'+
        '<input type="hidden" name="expected_state" value="'+cudoWorkEsc_(r.STATE)+'">'+
        '<label>Motivo / comentario</label>'+
        '<textarea name="reason" rows="2" required></textarea>'+
        '<label>Evidencia (obligatoria al completar)</label>'+
        '<input name="evidence_ref" placeholder="URL o referencia de evidencia">'+
        '<div class="actions">'+actions+'</div></form>'
      : '<div class="closed">Sin acciones pendientes para este estado.</div>';
    return '<article class="card">'+
      '<div class="meta">'+cudoWorkEsc_(r.RESOURCE)+(r.DUE_DATE?' · vence '+cudoWorkEsc_(r.DUE_DATE):' · sin fecha definida')+'</div>'+
      '<h2>'+cudoWorkEsc_(r.TITLE)+'</h2>'+
      '<p><b>Responsable:</b> '+cudoWorkEsc_(r.RESPONSIBLE)+'</p>'+
      '<p><b>Estado:</b> '+cudoWorkEsc_(r.STATE)+' · <b>Atención:</b> '+cudoWorkEsc_(r.ATTENTION)+'</p>'+
      '<p><b>Causa:</b> '+cudoWorkEsc_(r.SOURCE)+'</p>'+
      (r.SCHEDULE_CONTEXT?'<p><b>Ventana:</b> '+cudoWorkEsc_(r.SCHEDULE_CONTEXT)+'</p>':'')+
      (r.FINANCIAL_CONTEXT?'<p><b>Contexto financiero:</b> '+cudoWorkEsc_(r.FINANCIAL_CONTEXT)+'</p>':'')+
      form+
      '</article>';
  }).join('');

  const html='<!doctype html><html><head><base target="_top">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>CUDO · Estado operacional</title>'+
    '<style>'+
    'body{margin:0;background:#f4f2ed;color:#03163d;font-family:Arial,sans-serif}'+
    '.head{background:#03163d;color:#fff;border-bottom:6px solid #e21b2d;padding:28px 18px}'+
    '.wrap{max-width:900px;margin:auto}.content{padding:22px 18px 50px}'+
    '.card{background:#fff;border-radius:18px;padding:20px;margin:14px 0;border:1px solid #c8d0dc;box-shadow:0 8px 24px rgba(3,22,61,.08)}'+
    '.card h2{font-size:28px;margin:6px 0 12px}.meta{font-size:12px;color:#56657d}'+
    '.card label{display:block;font-weight:700;font-size:12px;margin:13px 0 6px}'+
    '.card textarea,.card input{width:100%;box-sizing:border-box;border:1px solid #aeb8c8;border-radius:10px;padding:10px}'+
    '.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}'+
    '.actions button{border:0;border-radius:10px;padding:11px 13px;font-weight:800;cursor:pointer;background:#03163d;color:#fff}'+
    '.msg{background:#e7f6ee;border-left:4px solid #0a7b48;padding:12px 14px;margin-bottom:14px}'+
    '.closed{margin-top:12px;color:#56657d}'+
    '.note{background:#fff8da;border-left:4px solid #f3c53b;padding:12px 14px;margin-bottom:14px;font-size:12px}'+
    '@media(max-width:600px){.actions{display:grid}.actions button{width:100%}}'+
    '</style></head><body>'+
    '<header class="head"><div class="wrap"><small>C.U.D.O. · Administración privada</small>'+
    '<h1>Estado operacional</h1><p>Responsabilidades, trabajo y estados del club.</p></div></header>'+
    '<main class="wrap content">'+
    (message?'<div class="msg">'+cudoWorkEsc_(message)+'</div>':'')+
    '<div class="note">QA: las acciones se procesan por el motor canónico; WORK_CONTROL es sólo una proyección.</div>'+
    (cards||'<div class="card">No hay trabajo operacional.</div>')+
    '</main></body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle('CUDO · Estado operacional')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DENY);
}
function cudoWorkHandlePost_(e){
  const reviewer=cudoWorkReviewer_();
  const workId=String(e.parameter.work_id||'').trim();
  const expectedState=String(e.parameter.expected_state||'').trim();
  const action=String(e.parameter.action||'').trim();
  const reason=String(e.parameter.reason||'').trim();
  const evidenceRef=String(e.parameter.evidence_ref||'').trim();

  if(!/^CUDO-WORK-[A-Z0-9_-]+$/.test(workId)) throw new Error('WORK_ID inválido');
  if(!['OPEN','IN_PROGRESS','BLOCKED','WAITING_EXTERNAL','DONE','CANCELLED'].includes(expectedState)){
    throw new Error('Estado esperado inválido');
  }
  if(!['START','BLOCK','WAIT_EXTERNAL','REOPEN','COMPLETE','CANCEL'].includes(action)){
    throw new Error('Acción inválida');
  }
  if(!reason) throw new Error('Debe indicar motivo o comentario');
  if(action==='COMPLETE'&&!evidenceRef) throw new Error('Completar requiere evidencia');

  const current=cudoWorkRows_().find(function(r){return r.WORK_ID===workId;});
  if(!current) throw new Error('Trabajo no encontrado');
  if(current.STATE!==expectedState) throw new Error('El estado cambió. Recargue antes de actuar.');

  const ts=Utilities.formatDate(new Date(),'UTC',"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
  const payload={
    ts:ts,
    work_id:workId,
    expected_state:expectedState,
    action:action,
    reason:reason,
    evidence_ref:evidenceRef,
    requested_by:reviewer
  };
  const requestId=cudoWorkStableRequestId_(payload);
  const sh=SpreadsheetApp.openById(CUDO_WORK_STATE_SHEET_ID_).getSheetByName(CUDO_WORK_REQUESTS_SHEET_);
  if(!sh) throw new Error('WORK_STATE_REQUESTS no existe');

  sh.appendRow([
    requestId,
    ts,
    workId,
    expectedState,
    action,
    reason,
    evidenceRef,
    reviewer,
    'PENDING',
    '',
    ''
  ]);

  cudoReviewDispatch_('apps_script_work_state');
  return cudoWorkRender_(
    'Solicitud enviada al motor CUDO. El estado visible cambiará sólo cuando la transición sea validada y aplicada.'
  );
}
