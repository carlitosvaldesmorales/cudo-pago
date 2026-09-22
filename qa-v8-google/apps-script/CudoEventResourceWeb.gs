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
function cudoEventRequestStatus_(requestId){
  if(!requestId) return null;
  const sh=SpreadsheetApp.openById(CUDO_EVENT_RESOURCE_SHEET_ID_).getSheetByName(CUDO_EVENT_RESOURCE_REQUESTS_);
  if(!sh) throw new Error('EVENT_RESOURCE_REQUESTS no existe');
  const values=sh.getDataRange().getDisplayValues();
  if(values.length<2) return null;
  const headers=values[0].map(function(v){return String(v||'').trim();});
  const idCol=headers.indexOf('REQUEST_ID');
  if(idCol<0) throw new Error('Contrato EVENT_RESOURCE_REQUESTS incompleto');
  for(let i=1;i<values.length;i++){
    if(String(values[i][idCol]||'').trim()!==requestId) continue;
    const row={};
    headers.forEach(function(h,j){row[h]=String(values[i][j]||'').trim();});
    return row;
  }
  return null;
}
function cudoEventWaitContext_(e){
  const p=(e&&e.parameter)||{};
  const requestId=String(p.pending_request||'').trim();
  if(!requestId) return {message:'',refresh_url:''};
  const eventId=String(p.pending_event||'').trim();
  const expectedRevision=Number(p.pending_revision);
  const request=cudoEventRequestStatus_(requestId);
  const current=cudoEventRows_().find(function(row){return row.EVENT_ID===eventId;});
  const baseUrl=ScriptApp.getService().getUrl();
  const refreshUrl=baseUrl+'?view=event&pending_request='+encodeURIComponent(requestId)+
    '&pending_event='+encodeURIComponent(eventId)+'&pending_revision='+encodeURIComponent(String(expectedRevision));
  if(!request||request.PROCESS_STATUS==='PENDING'){
    return {message:'Solicitud recibida. El motor CUDO la está validando y persistiendo…',refresh_url:refreshUrl};
  }
  if(request.PROCESS_STATUS==='APPLIED'){
    if(current&&Number(current.STORE_REVISION)>expectedRevision){
      return {message:'Cambio confirmado por el motor CUDO. Estado canónico actualizado a revisión '+current.STORE_REVISION+'.',refresh_url:''};
    }
    return {message:'Solicitud aplicada. Sincronizando la lectura canónica…',refresh_url:refreshUrl};
  }
  if(request.PROCESS_STATUS==='BLOCKED'){
    return {message:'La solicitud fue bloqueada sin mutar el estado: '+String(request.RESULT||'revisión requerida')+'.',refresh_url:''};
  }
  return {message:'Esperando confirmación del motor CUDO…',refresh_url:refreshUrl};
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
function cudoEventJson_(value,fallback){try{return JSON.parse(String(value||''))}catch(e){return fallback}}
function cudoEventOptions_(rows,key,label){
  return (rows||[]).map(function(x){return '<option value="'+cudoEventEsc_(x[key])+'">'+cudoEventEsc_(label(x))+'</option>';}).join('');
}
function cudoEventCommerceForms_(row,prefix){
  const offerings=cudoEventJson_(row.OFFERINGS_JSON,[]);
  const inventory=cudoEventJson_(row.INVENTORY_JSON,[]);
  const prepared=offerings.filter(function(x){return x.mode==='PREPARED'});
  let html=''+
    '<details open><summary>Qué vamos a vender</summary><form method="post">'+cudoEventHidden_(row,prefix+'_ADD_OFFERING')+
    '<label>Producto / preparación</label><input name="name" placeholder="Ej. completo, empanada, bebida" required>'+
    '<label>Cómo lo tendremos</label><select name="mode"><option value="PREPARED">Lo preparamos en CUDO</option><option value="DIRECT_RESALE">Lo compramos listo / reventa</option></select>'+
    '<label>Precio de venta</label><input name="sell_price" type="number" min="0" required>'+
    '<button>Agregar a esta jornada</button></form></details>';
  if(prepared.length){
    html+='<details><summary>Preparación e insumos</summary><form method="post">'+cudoEventHidden_(row,prefix+'_ADD_INGREDIENT')+
      '<label>Preparación</label><select name="offering_id">'+cudoEventOptions_(prepared,'offering_id',function(x){return x.name})+'</select>'+
      '<label>Insumo</label><input name="item_name" placeholder="Ej. pan, tomate, palta" required>'+
      '<label>Consumo por unidad vendida</label><input name="qty_per_sale" type="number" min="0.001" step="0.001" required>'+
      '<label>Unidad de control</label><select name="unit"><option value="unidad">unidad</option><option value="kg">kg</option><option value="litro">litro</option><option value="porcion">porción</option></select>'+
      '<button>Agregar insumo</button></form></details>';
  }
  if(inventory.length){
    html+='<details><summary>Compra / inventario real</summary><form method="post">'+cudoEventHidden_(row,prefix+'_PURCHASE')+
      '<label>Insumo / unidad</label><select name="item_id">'+cudoEventOptions_(inventory,'item_id',function(x){return x.name+' · '+x.unit+' · stock '+x.stock})+'</select>'+
      '<label>Cantidad comprada</label><input name="qty" type="number" min="0.001" step="0.001" required>'+
      '<label>Costo por unidad de control</label><input name="unit_cost" type="number" min="1" required>'+
      '<label>Proveedor</label><input name="supplier" value="Proveedor QA" required>'+
      '<label>Pago</label><select name="payment"><option value="PENDING">Pendiente</option><option value="CASH">Efectivo</option><option value="TRANSFER">Transferencia</option></select>'+
      '<button>Registrar compra</button></form></details>';
  }
  if(offerings.length){
    html+='<details><summary>Venta</summary><form method="post">'+cudoEventHidden_(row,prefix+'_SALE')+
      '<label>Qué se vendió</label><select name="offering_id">'+cudoEventOptions_(offerings,'offering_id',function(x){return x.name+' · disponible '+String(x.available_qty||0)})+'</select>'+
      '<label>Cantidad vendida</label><input name="qty" type="number" min="1" required>'+
      '<label>Precio unitario</label><input name="unit_price" type="number" min="0" required>'+
      '<label>Medio de pago</label><select name="method"><option value="CASH">Efectivo</option><option value="TRANSFER">Transferencia</option></select>'+
      '<button>Registrar venta</button></form></details>';
  }
  return html;
}
function cudoEventMatchForms_(row){
  return cudoEventCommerceForms_(row,'MATCH')+
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
    cudoEventCommerceForms_(row,'BINGO')+
    '<details><summary>Cierre</summary><form method="post">'+cudoEventHidden_(row,'BINGO_CLOSE')+
    '<button>Cerrar bingo QA</button></form></details>';
}

function cudoEventCard_(row){
  const isMatch=row.KIND==='MATCH';
  const forms=isMatch?cudoEventMatchForms_(row):cudoEventBingoForms_(row);
  const offerings=cudoEventJson_(row.OFFERINGS_JSON,[]);
  const inventory=cudoEventJson_(row.INVENTORY_JSON,[]);
  return '<article class="card">'+
    '<div class="meta">'+cudoEventEsc_(row.KIND)+' · revisión '+cudoEventEsc_(row.STORE_REVISION)+'</div>'+
    '<h2>'+cudoEventEsc_(row.DISPLAY_NAME)+'</h2>'+
    '<div class="stats">'+
      '<span><b>Oferta</b>'+cudoEventEsc_(offerings.length)+' ítems</span>'+
      '<span><b>Inventario</b>'+cudoEventEsc_(inventory.length)+' insumos/unidades</span>'+
      '<span><b>Ventas</b>$'+cudoEventEsc_(row.SALES_REVENUE)+'</span>'+
      '<span><b>Proveedor</b>$'+cudoEventEsc_(row.SUPPLIER_PAYABLE)+'</span>'+
      '<span><b>Recurso</b>$'+cudoEventEsc_(row.RESOURCE_RESULT)+'</span>'+
    '</div>'+
    (row.CLOSED==='TRUE'?'<div class="closed">Jornada cerrada</div>':forms)+
    '</article>';
}

function cudoEventRender_(message,e){
  const reviewer=cudoEventReviewer_();
  const rows=cudoEventRows_();
  const wait=cudoEventWaitContext_(e);
  const visibleMessage=wait.message||message||'';
  const cards=rows.map(cudoEventCard_).join('');
  const html='<!doctype html><html><head><base target="_top">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    (wait.refresh_url?'<meta http-equiv="refresh" content="3;url='+cudoEventEsc_(wait.refresh_url)+'">':'')+
    '<title>CUDO · Hechos del club QA</title><style>'+
    'body{margin:0;background:#f4f2ed;color:#03163d;font-family:Arial,sans-serif}.head{background:#03163d;color:#fff;border-bottom:6px solid #e21b2d;padding:25px 18px}.head a{color:#fff;font-weight:800}.wrap{max-width:920px;margin:auto}.content{padding:18px}.note{background:#fff8da;border-left:4px solid #c79b00;padding:11px 13px;margin-bottom:14px}.msg{background:#e7f6ee;border-left:4px solid #0a7b48;padding:11px 13px;margin-bottom:14px}.card{background:#fff;border:1px solid #ccd4df;border-radius:16px;padding:18px;margin:14px 0;box-shadow:0 8px 24px rgba(3,22,61,.08)}h1,h2{margin:4px 0 10px}h2{font-size:27px}.meta{font-size:12px;color:#657188}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.stats span{background:#f4f7fb;border-radius:10px;padding:10px;font-size:12px}.stats b{display:block;margin-bottom:4px}details{border-top:1px solid #e6e9ee;padding:11px 0}summary{font-weight:800;cursor:pointer}label{display:block;font-size:12px;font-weight:800;margin:9px 0 5px}input,select{width:100%;box-sizing:border-box;border:1px solid #abb6c5;border-radius:9px;padding:10px}button{border:0;border-radius:9px;padding:11px 13px;background:#03163d;color:#fff;font-weight:800;margin-top:10px}.closed{background:#e7f6ee;padding:12px;border-radius:10px;font-weight:800}@media(max-width:650px){.stats{grid-template-columns:1fr 1fr}}'+
    '</style></head><body><header class="head"><div class="wrap"><a href="https://cudo.cl/qa-pr219/admin/">← Administración CUDO</a><small style="display:block;margin-top:10px">C.U.D.O. · Administración privada · QA</small><h1>Partido y Bingo</h1><p>Acciones gobernadas sobre el mismo núcleo canónico.</p></div></header>'+
    '<main class="wrap content">'+
    (visibleMessage?'<div class="msg">'+cudoEventEsc_(visibleMessage)+'</div>':'')+
    '<div class="note"><b>QA gobernada:</b> Google sólo recibe solicitudes y proyecciones. La autoridad es el estado canónico versionado. Acceso: '+cudoEventEsc_(reviewer)+'</div>'+
    (cards||'<div class="card">No hay eventos QA disponibles.</div>')+
    '</main></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle('CUDO · Partido y Bingo QA')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function cudoEventPayload_(action,p){
  if(action==='MATCH_ADD_OFFERING'||action==='BINGO_ADD_OFFERING') return {name:String(p.name||'').trim(),mode:String(p.mode||'').trim(),sell_price:Number(p.sell_price)};
  if(action==='MATCH_ADD_INGREDIENT'||action==='BINGO_ADD_INGREDIENT') return {offering_id:String(p.offering_id||'').trim(),item_name:String(p.item_name||'').trim(),qty_per_sale:Number(p.qty_per_sale),unit:String(p.unit||'unidad').trim()};
  if(action==='MATCH_PURCHASE'||action==='BINGO_PURCHASE') return {item_id:String(p.item_id||'').trim(),qty:Number(p.qty),unit_cost:Number(p.unit_cost),supplier:String(p.supplier||'').trim(),payment:String(p.payment||'PENDING').trim()};
  if(action==='MATCH_SALE'||action==='BINGO_SALE') return {offering_id:String(p.offering_id||'').trim(),qty:Number(p.qty),unit_price:Number(p.unit_price),method:String(p.method||'CASH').trim()};
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
    'CUDO-EVENT-QA-MATCH-FULLDAY-001':['MATCH_ADD_OFFERING','MATCH_ADD_INGREDIENT','MATCH_PURCHASE','MATCH_SALE','MATCH_RESULT','MATCH_CLOSE'],
    'CUDO-EVENT-QA-BINGO-FULLDAY-001':['BINGO_ADD_OFFERING','BINGO_ADD_INGREDIENT','BINGO_CONFIRM_PERMIT','BINGO_DONATE_PRIZE','BINGO_PURCHASE','BINGO_SALE','BINGO_CLOSE']
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
  return cudoEventRender_('',{parameter:{pending_request:requestId,pending_event:eventId,pending_revision:String(expectedRevision)}});
}

function cudoEventRuntimeStatus(){
  const rows=cudoEventRows_();
  return {
    ok:true,
    allowed_reviewer:CUDO_EVENT_RESOURCE_ALLOWED_REVIEWER_,
    row_count:rows.length,
    events:rows.map(function(row){
      return {
        event_id:row.EVENT_ID,
        kind:row.KIND,
        store_revision:Number(row.STORE_REVISION),
        authority:row.AUTHORITY,
        closed:row.CLOSED==='TRUE'
      };
    }),
    production_write:false
  };
}
