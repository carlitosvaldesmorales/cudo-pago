const CUDO_EVENT_RESOURCE_SHEET_ID_='1BEb1eIpJhcVb7WzaSQ7J_YzbjOhzIyPfcb8lLAIJPvw';
const CUDO_EVENT_RESOURCE_CONTROL_='EVENT_RESOURCE_CONTROL';
const CUDO_EVENT_RESOURCE_REQUESTS_='EVENT_RESOURCE_REQUESTS';
const CUDO_EVENT_RESOURCE_ALLOWED_REVIEWER_='sistemas@cudo.cl';
const CUDO_EVENT_RESOURCE_QA_REF_='agent/match-full-club-day-roundtrip-20260921';

function cudoEventEsc_(v){
  return String(v==null?'':v).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function cudoEventReviewer_(){
  const active=String(Session.getActiveUser().getEmail()||'').toLowerCase();
  const effective=String(Session.getEffectiveUser().getEmail()||'').toLowerCase();
  const email=active||effective;
  if(email!==CUDO_EVENT_RESOURCE_ALLOWED_REVIEWER_) throw new Error('Acceso no autorizado.');
  return email;
}
function cudoEventRows_(){
  const sh=SpreadsheetApp.openById(CUDO_EVENT_RESOURCE_SHEET_ID_).getSheetByName(CUDO_EVENT_RESOURCE_CONTROL_);
  if(!sh) throw new Error('EVENT_RESOURCE_CONTROL no existe');
  const values=sh.getDataRange().getDisplayValues();
  if(values.length<2) return [];
  const headers=values[0].map(function(v){return String(v||'').trim();});
  return values.slice(1).map(function(row,i){
    const obj={__row:i+2};
    headers.forEach(function(h,j){obj[h]=String(row[j]||'').trim();});
    return obj;
  }).filter(function(row){return row.EVENT_ID;});
}
function cudoEventStableRequestId_(payload){
  const bytes=Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(payload),
    Utilities.Charset.UTF_8
  );
  const hex=bytes.map(function(b){return ('0'+((b<0?b+256:b).toString(16))).slice(-2)}).join('').slice(0,16).toUpperCase();
  return 'CUDO-EVENT-REQ-'+hex;
}
function cudoEventHidden_(row,action){
  return '<input type="hidden" name="kind" value="EVENT_RESOURCE">'+
    '<input type="hidden" name="event_id" value="'+cudoEventEsc_(row.EVENT_ID)+'">'+
    '<input type="hidden" name="expected_revision" value="'+cudoEventEsc_(row.STORE_REVISION)+'">'+
    '<input type="hidden" name="action" value="'+cudoEventEsc_(action)+'">';
}
function cudoEventMatchForms_(row){
  return ''+
    '<details><summary>Compra / stock</summary><form method="post">'+cudoEventHidden_(row,'MATCH_PURCHASE')+
    '<label>Cantidad comprada</label><input name="qty" type="number" min="1" required>'+
    '<label>Costo unitario</label><input name="unit_cost" type="number" min="1" required>'+
    '<button>Registrar compra</button></form></details>'+
    '<details><summary>Venta</summary><form method="post">'+cudoEventHidden_(row,'MATCH_SALE')+
    '<label>Cantidad vendida</label><input name="qty" type="number" min="1" required>'+
    '<label>Precio unitario</label><input name="unit_price" type="number" min="1" required>'+
    '<button>Registrar venta</button></form></details>'+
    '<details><summary>Resultado deportivo</summary><form method="post">'+cudoEventHidden_(row,'MATCH_RESULT')+
    '<label>Serie</label><select name="series"><option>Tercera</option><option>Segunda</option><option>Senior</option><option>Primera</option></select>'+
    '<label>CUDO</label><input name="home" type="number" min="0" required>'+
    '<label>Rival</label><input name="away" type="number" min="0" required>'+
    '<button>Registrar resultado</button></form></details>'+
    '<details><summary>Cierre</summary><form method="post">'+cudoEventHidden_(row,'MATCH_CLOSE')+
    '<button>Cerrar jornada QA</button></form></details>';
}
function cudoEventBingoForms_(row){
  return ''+
    '<details><summary>Permiso / autorización</summary><form method="post">'+cudoEventHidden_(row,'BINGO_CONFIRM_PERMIT')+
    '<label>Referencia de autorización</label><input name="reference" required>'+
    '<button>Confirmar permiso</button></form></details>'+
    '<details><summary>Premio donado</summary><form method="post">'+cudoEventHidden_(row,'BINGO_DONATE_PRIZE')+
    '<label>Premio</label><input name="name" required>'+
    '<label>Referencia de donación</label><input name="reference" required>'+
    '<button>Registrar premio donado</button></form></details>'+
    '<details><summary>Compra / stock</summary><form method="post">'+cudoEventHidden_(row,'BINGO_PURCHASE')+
    '<label>Cantidad comprada</label><input name="qty" type="number" min="1" required>'+
    '<label>Costo unitario</label><input name="unit_cost" type="number" min="1" required>'+
    '<button>Registrar compra</button></form></details>'+
    '<details><summary>Venta</summary><form method="post">'+cudoEventHidden_(row,'BINGO_SALE')+
    '<label>Cantidad vendida</label><input name="qty" type="number" min="1" required>'+
    '<label>Precio unitario</label><input name="unit_price" type="number" min="1" required>'+
    '<button>Registrar venta</button></form></details>'+
    '<details><summary>Cierre</summary><form method="post">'+cudoEventHidden_(row,'BINGO_CLOSE')+
    '<button>Cerrar bingo QA</button></form></details>';
}
function cudoEventCard_(row){
  const isMatch=row.KIND==='MATCH';
  const forms=isMatch?cudoEventMatchForms_(row):cudoEventBingoForms_(row);
  return '<article class="card">'+
    '<div class="meta">'+cudoEventEsc_(row.KIND)+' · revisión '+cudoEventEsc_(row.STORE_REVISION)+'</div>'+
    '<h2>'+cudoEventEsc_(row.DISPLAY_NAME)+'</h2>'+
    '<div class="stats">'+
      '<span><b>Stock</b>'+cudoEventEsc_(row.STOCK)+'</span>'+
      '<span><b>Ventas</b>$'+cudoEventEsc_(row.SALES_REVENUE)+'</span>'+
      '<span><b>Proveedor</b>$'+cudoEventEsc_(row.SUPPLIER_PAYABLE)+'</span>'+
      '<span><b>Recurso</b>$'+cudoEventEsc_(row.RESOURCE_RESULT)+'</span>'+
    '</div>'+
    (row.CLOSED==='TRUE'?'<div class="closed">Jornada cerrada</div>':forms)+
    '</article>';
}
function cudoEventRender_(message){
  const reviewer=cudoEventReviewer_();
  const rows=cudoEventRows_();
  const cards=rows.map(cudoEventCard_).join('');
  const html='<!doctype html><html><head><base target="_top">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>CUDO · Hechos del club QA</title><style>'+
    'body{margin:0;background:#f4f2ed;color:#03163d;font-family:Arial,sans-serif}.head{background:#03163d;color:#fff;border-bottom:6px solid #e21b2d;padding:25px 18px}.wrap{max-width:920px;margin:auto}.content{padding:18px}.note{background:#fff8da;border-left:4px solid #c79b00;padding:11px 13px;margin-bottom:14px}.msg{background:#e7f6ee;border-left:4px solid #0a7b48;padding:11px 13px;margin-bottom:14px}.card{background:#fff;border:1px solid #ccd4df;border-radius:16px;padding:18px;margin:14px 0;box-shadow:0 8px 24px rgba(3,22,61,.08)}h1,h2{margin:4px 0 10px}h2{font-size:27px}.meta{font-size:12px;color:#657188}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.stats span{background:#f4f7fb;border-radius:10px;padding:10px;font-size:12px}.stats b{display:block;margin-bottom:4px}details{border-top:1px solid #e6e9ee;padding:11px 0}summary{font-weight:800;cursor:pointer}label{display:block;font-size:12px;font-weight:800;margin:9px 0 5px}input,select{width:100%;box-sizing:border-box;border:1px solid #abb6c5;border-radius:9px;padding:10px}button{border:0;border-radius:9px;padding:11px 13px;background:#03163d;color:#fff;font-weight:800;margin-top:10px}.closed{background:#e7f6ee;padding:12px;border-radius:10px;font-weight:800}@media(max-width:650px){.stats{grid-template-columns:1fr 1fr}}'+
    '</style></head><body><header class="head"><div class="wrap"><small>C.U.D.O. · Administración privada · QA</small><h1>Partido y Bingo</h1><p>Acciones gobernadas sobre el mismo núcleo canónico.</p></div></header>'+
    '<main class="wrap content">'+
    (message?'<div class="msg">'+cudoEventEsc_(message)+'</div>':'')+
    '<div class="note"><b>QA gobernada:</b> Google sólo recibe solicitudes y proyecciones. La autoridad es el estado canónico versionado. Acceso: '+cudoEventEsc_(reviewer)+'</div>'+
    (cards||'<div class="card">No hay eventos QA disponibles.</div>')+
    '</main></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle('CUDO · Partido y Bingo QA')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function cudoEventPayload_(action,p){
  if(action==='MATCH_PURCHASE'||action==='BINGO_PURCHASE') return {qty:Number(p.qty),unit_cost:Number(p.unit_cost)};
  if(action==='MATCH_SALE'||action==='BINGO_SALE') return {qty:Number(p.qty),unit_price:Number(p.unit_price)};
  if(action==='MATCH_RESULT') return {series:String(p.series||''),home:Number(p.home),away:Number(p.away)};
  if(action==='BINGO_CONFIRM_PERMIT') return {reference:String(p.reference||'').trim()};
  if(action==='BINGO_DONATE_PRIZE') return {name:String(p.name||'').trim(),reference:String(p.reference||'').trim()};
  if(action==='MATCH_CLOSE'||action==='BINGO_CLOSE') return {};
  throw new Error('Acción de evento inválida.');
}
function cudoEventHandlePost_(e){
  const reviewer=cudoEventReviewer_();
  const p=(e&&e.parameter)||{};
  const eventId=String(p.event_id||'').trim();
  const expectedRevision=Number(p.expected_revision);
  const action=String(p.action||'').trim().toUpperCase();
  const allowed={
    'CUDO-EVENT-QA-MATCH-FULLDAY-001':['MATCH_PURCHASE','MATCH_SALE','MATCH_RESULT','MATCH_CLOSE'],
    'CUDO-EVENT-QA-BINGO-FULLDAY-001':['BINGO_CONFIRM_PERMIT','BINGO_DONATE_PRIZE','BINGO_PURCHASE','BINGO_SALE','BINGO_CLOSE']
  };
  if(!allowed[eventId]||allowed[eventId].indexOf(action)<0) throw new Error('Evento o acción no autorizada.');
  if(!Number.isInteger(expectedRevision)||expectedRevision<1) throw new Error('Revisión inválida.');
  const current=cudoEventRows_().find(function(row){return row.EVENT_ID===eventId;});
  if(!current) throw new Error('Evento no encontrado.');
  if(Number(current.STORE_REVISION)!==expectedRevision) throw new Error('El estado cambió. Recargue antes de actuar.');

  const payload=cudoEventPayload_(action,p);
  const ts=Utilities.formatDate(new Date(),'UTC',"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
  const evidenceRef='qa://apps-script-event/'+eventId+'/'+action+'/'+ts;
  const base={ts:ts,event_id:eventId,expected_revision:expectedRevision,action:action,payload:payload,requested_by:reviewer};
  const requestId=cudoEventStableRequestId_(base);
  const sheet=SpreadsheetApp.openById(CUDO_EVENT_RESOURCE_SHEET_ID_).getSheetByName(CUDO_EVENT_RESOURCE_REQUESTS_);
  if(!sheet) throw new Error('EVENT_RESOURCE_REQUESTS no existe');
  sheet.appendRow([
    requestId,ts,eventId,expectedRevision,action,JSON.stringify(payload),
    'CUDO Web QA '+action,evidenceRef,reviewer,'PENDING','',''
  ]);
  cudoReviewDispatch_('apps_script_event_resource',CUDO_EVENT_RESOURCE_QA_REF_);
  return cudoEventRender_('Solicitud enviada al motor CUDO. La pantalla reflejará el cambio sólo después de validarse y persistirse.');
}
