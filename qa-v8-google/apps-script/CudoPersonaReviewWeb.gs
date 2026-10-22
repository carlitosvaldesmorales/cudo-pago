const CUDO_PERSONAS_SHEET_ID_='1X4fefDQaaktoTGjzU77SXFrYj4n9JuaUm45Tnldiu0Y';
const CUDO_PERSONAS_CONTROL_='PERSONAS_CONTROL';
const CUDO_REVIEW_SHEET_ID_PERSONA_='1KnC56IWf2hRxrGU4ksdO-JlzWyl2XJbhbOHKkdx4vms';
const CUDO_REVIEW_AUDIT_PERSONA_='AUDITORIA_REVISION';
const CUDO_PERSONA_ALLOWED_REVIEWER_='sistemas@cudo.cl';

function cudoPersonaReviewer_(){
  const active=String(Session.getActiveUser().getEmail()||'').toLowerCase();
  const effective=String(Session.getEffectiveUser().getEmail()||'').toLowerCase();
  const email=active||effective;
  if(email!==CUDO_PERSONA_ALLOWED_REVIEWER_) throw new Error('Acceso no autorizado.');
  return email;
}
function cudoPersonaEsc_(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function cudoPersonaRows_(){
  const sh=SpreadsheetApp.openById(CUDO_PERSONAS_SHEET_ID_).getSheetByName(CUDO_PERSONAS_CONTROL_);
  if(!sh) throw new Error('PERSONAS_CONTROL no existe');
  const values=sh.getDataRange().getDisplayValues();
  if(values.length<2) return [];
  const h=values[0];
  return values.slice(1).map((r,i)=>({__row:i+2,...Object.fromEntries(h.map((x,j)=>[x,String(r[j]||'').trim()]))})).filter(r=>r.ID_PERSONA);
}
function cudoPersonaStableReviewId_(payload){
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(payload),Utilities.Charset.UTF_8);
  const hex=bytes.map(b=>('0'+((b<0?b+256:b).toString(16))).slice(-2)).join('').slice(0,16).toUpperCase();
  return 'CUDO-REV-'+hex;
}
function cudoPersonaAudit_(id,decision,observations,reviewer){
  const ts=Utilities.formatDate(new Date(),'UTC',"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
  const audit=SpreadsheetApp.openById(CUDO_REVIEW_SHEET_ID_PERSONA_).getSheetByName(CUDO_REVIEW_AUDIT_PERSONA_);
  if(!audit) throw new Error('AUDITORIA_REVISION no existe');
  const payload={ts,type:'PERSONA',id,decision,observations,reviewer};
  const rid=cudoPersonaStableReviewId_(payload);
  audit.appendRow([rid,ts,'PERSONA',id,decision,'NO','NO APLICA',observations,reviewer,'','','','','','','']);
  return {rid,ts};
}
function cudoPersonaMarkRequested_(id,decision,reviewer,observations){
  const sh=SpreadsheetApp.openById(CUDO_PERSONAS_SHEET_ID_).getSheetByName(CUDO_PERSONAS_CONTROL_);
  const values=sh.getDataRange().getDisplayValues();
  const h=values[0]; const idCol=h.indexOf('ID_PERSONA'),decCol=h.indexOf('DECISION'),revCol=h.indexOf('REVISOR'),obsCol=h.indexOf('OBSERVACIONES');
  if([idCol,decCol,revCol,obsCol].some(x=>x<0)) throw new Error('Contrato PERSONAS_CONTROL incompleto');
  for(let i=1;i<values.length;i++) if(String(values[i][idCol]).trim()===id){
    sh.getRange(i+1,decCol+1).setValue(decision);
    sh.getRange(i+1,revCol+1).setValue(reviewer);
    sh.getRange(i+1,obsCol+1).setValue(observations);
    return;
  }
  throw new Error('Ficha no encontrada');
}
function cudoPersonaRender_(message){
  const reviewer=cudoPersonaReviewer_();
  const rows=cudoPersonaRows_();
  const pending=rows.filter(r=>r.ESTADO==='PENDIENTE_REVISION');
  const followup=rows.filter(r=>r.ESTADO==='REQUIERE_CORRECCION');
  const closed=rows.filter(r=>['ALTA','RECHAZADO'].includes(r.ESTADO));
  const cards=pending.map(r=>`<article class="card"><div class="meta">${cudoPersonaEsc_(r.FECHA_ENVIO)} · ${cudoPersonaEsc_(r.RELACION_CUDO)}</div><h2>${cudoPersonaEsc_(r.NOMBRE_PUBLICO)}</h2>${r.FUNCION_CLUB?`<p><b>Función:</b> ${cudoPersonaEsc_(r.FUNCION_CLUB)}</p>`:''}${r.SERIE_CATEGORIA?`<p><b>Serie:</b> ${cudoPersonaEsc_(r.SERIE_CATEGORIA)} · <b>Posición:</b> ${cudoPersonaEsc_(r.POSICION)}${r.NUMERO?` · <b>N°:</b> ${cudoPersonaEsc_(r.NUMERO)}`:''}</p>`:''}${r.FOTO_NOMBRE?`<p><b>Foto recibida:</b> ${cudoPersonaEsc_(r.FOTO_NOMBRE)}</p>`:''}${r.RED_SOCIAL_REF?`<p><b>Red social:</b> ${cudoPersonaEsc_(r.RED_SOCIAL_REF)}</p>`:''}${r.PRESENTACION?`<div class="bio">${cudoPersonaEsc_(r.PRESENTACION)}</div>`:''}<form method="post"><input type="hidden" name="id" value="${cudoPersonaEsc_(r.ID_PERSONA)}"><label>Observación interna / motivo de corrección</label><textarea name="observations" rows="3"></textarea><div class="actions"><button name="decision" value="DAR_DE_ALTA" class="ok">Dar de alta</button><button name="decision" value="PEDIR_CORRECCION" class="warn">Pedir corrección</button><button name="decision" value="RECHAZAR" class="bad">Rechazar</button></div></form></article>`).join('');
  const status=[...followup,...closed].map(r=>`<li><b>${cudoPersonaEsc_(r.NOMBRE_PUBLICO)}</b> · ${cudoPersonaEsc_(r.RELACION_CUDO)} · <span>${cudoPersonaEsc_(r.ESTADO)}</span></li>`).join('');
  return HtmlService.createHtmlOutput(`<!doctype html><html><head><base target="_top"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CUDO · Solicitudes de fichas</title><style>body{margin:0;background:#f4f2ed;color:#03163d;font-family:Arial,sans-serif}.head{background:#03163d;color:white;border-bottom:6px solid #e21b2d;padding:28px 18px}.wrap{max-width:860px;margin:auto}.head h1{margin:4px 0 6px;font-size:34px;text-transform:uppercase}.head p{margin:0;color:#dce5f5}.content{padding:22px 18px 50px}.summary{background:white;border-radius:16px;padding:16px;margin-bottom:16px;border:1px solid #c8d0dc}.card{background:white;border-radius:18px;padding:20px;margin:14px 0;border:1px solid #c8d0dc;box-shadow:0 8px 24px rgba(3,22,61,.08)}.card h2{margin:5px 0 10px;font-size:28px}.meta{font-size:12px;color:#56657d}.card p{margin:7px 0}.bio{background:#f4f7fb;border-radius:12px;padding:12px;margin:12px 0;line-height:1.45}.card label{display:block;font-weight:700;font-size:12px;margin:14px 0 6px}.card textarea{width:100%;box-sizing:border-box;border:1px solid #aeb8c8;border-radius:10px;padding:10px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.actions button{border:0;border-radius:10px;padding:11px 13px;font-weight:800;cursor:pointer}.ok{background:#0a7b48;color:white}.warn{background:#f0b429;color:#1d1600}.bad{background:#b50f20;color:white}.msg{background:#e7f6ee;border-left:4px solid #0a7b48;padding:12px 14px;margin-bottom:14px}.empty{padding:25px;text-align:center;color:#56657d;background:white;border-radius:16px}ul{padding-left:20px}small{color:#6b778c}@media(max-width:600px){.actions{display:grid;grid-template-columns:1fr}.actions button{width:100%}}</style></head><body><header class="head"><div class="wrap"><small>C.U.D.O. · Administración privada</small><h1>Solicitudes de fichas</h1><p>Acceso autorizado: ${cudoPersonaEsc_(reviewer)}</p></div></header><main class="wrap content">${message?`<div class="msg">${cudoPersonaEsc_(message)}</div>`:''}<div class="summary"><b>${pending.length} pendiente${pending.length===1?'':'s'}</b> · ${followup.length} con corrección solicitada · ${closed.length} cerrada${closed.length===1?'':'s'}</div>${cards||'<div class="empty">No hay fichas pendientes de revisión.</div>'}${status?`<section class="summary"><h3>Estado de otras solicitudes</h3><ul>${status}</ul></section>`:''}</main></body></html>`).setTitle('CUDO · Solicitudes de fichas').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DENY);
}
function cudoPersonaHandlePost_(e){
  const reviewer=cudoPersonaReviewer_();
  const id=String(e.parameter.id||'').trim(),decision=String(e.parameter.decision||'').trim(),observations=String(e.parameter.observations||'').trim();
  if(!/^CUDO-PER-[A-Za-z0-9_-]+$/.test(id)) throw new Error('ID de ficha inválido');
  if(!['DAR_DE_ALTA','PEDIR_CORRECCION','RECHAZAR'].includes(decision)) throw new Error('Decisión inválida');
  const current=cudoPersonaRows_().find(r=>r.ID_PERSONA===id);
  if(!current||current.ESTADO!=='PENDIENTE_REVISION') throw new Error('La ficha ya no está pendiente');
  cudoPersonaAudit_(id,decision,observations,reviewer);
  cudoPersonaMarkRequested_(id,decision,reviewer,observations);
  cudoReviewDispatch_('apps_script_persona_review');
  return cudoPersonaRender_('Decisión enviada al CUDO Review Engine. La ficha permanecerá visible hasta que el motor confirme el cambio de estado.');
}
function doGet(e){
  const view=String((e&&e.parameter&&e.parameter.view)||'persona').trim().toLowerCase();
  if(view==='work') return cudoWorkRender_('');
  if(view==='assignments') return cudoEventAssignmentRender_('',String((e&&e.parameter&&e.parameter.activity)||'').trim());
  return cudoPersonaRender_('');
}
function doPost(e){
  const kind=String((e&&e.parameter&&e.parameter.kind)||'PERSONA').trim().toUpperCase();
  if(kind==='WORK_ITEM') return cudoWorkHandlePost_(e);
  if(kind==='EVENT_ASSIGNMENT') return cudoEventAssignmentHandlePost_(e);
  return cudoPersonaHandlePost_(e);
}
