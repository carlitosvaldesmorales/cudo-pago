const CUDO_EVENT_ASSIGNMENT_SHEET_ID_='1Yf2JeTLY6_Vk9URlV2FoXhuKWyJGcXEePx1OmApEYqA';
const CUDO_EVENT_ASSIGNMENT_DEFAULT_ACTIVITY_ID_='QA-ACTIVITY-MATCH-PR219-001';

function cudoEventAssignmentRows_(sheetId,name){
  const sh=SpreadsheetApp.openById(sheetId).getSheetByName(name);
  if(!sh) throw new Error('Hoja no encontrada: '+name);
  const values=sh.getDataRange().getDisplayValues();
  if(values.length<2) return [];
  const h=values[0].map(function(v){return String(v||'').trim();});
  return values.slice(1).map(function(r,i){
    const obj={__row:i+2};
    h.forEach(function(x,j){obj[x]=String(r[j]||'').trim();});
    return obj;
  }).filter(function(r){return h.some(function(x){return r[x];});});
}

function cudoEventAssignablePeople_(){
  cudoPersonaReviewer_();
  const byId={};
  cudoWorkRows_().forEach(function(r){
    const id=String(r.RESPONSIBLE_ACTOR_ID||'').trim();
    const name=String(r.RESPONSIBLE||'').trim();
    if(id&&name&&!byId[id]){
      byId[id]={person_ref:id,person_display:name,source:'ACTOR_OPERATIONAL',status:'ACTIVE_EVIDENCE_BACKED'};
    }
  });
  cudoPersonaRows_().forEach(function(r){
    const id=String(r.ID_PERSONA||'').trim();
    const name=String(r.NOMBRE_PUBLICO||'').trim();
    const state=String(r.ESTADO||'').trim().toUpperCase();
    const privacy=String(r.PRIVACIDAD||'').trim().toUpperCase();
    if(id&&name&&state==='ALTA'&&(!privacy||privacy==='INTERNO'||privacy==='PRIVADO')){
      byId[id]={person_ref:id,person_display:name,source:'PERSONA_ALTA',status:'ALTA'};
    }
  });
  return Object.keys(byId).map(function(id){return byId[id];}).sort(function(a,b){
    return a.person_display.localeCompare(b.person_display,'es');
  });
}

function cudoEventAssignmentState_(activityId){
  const aid=String(activityId||CUDO_EVENT_ASSIGNMENT_DEFAULT_ACTIVITY_ID_);
  const activities=cudoEventAssignmentRows_(CUDO_EVENT_ASSIGNMENT_SHEET_ID_,'ACTIVIDADES');
  const activity=activities.find(function(r){return r.activity_id===aid;});
  if(!activity) throw new Error('Actividad no encontrada: '+aid);
  const fronts=cudoEventAssignmentRows_(CUDO_EVENT_ASSIGNMENT_SHEET_ID_,'FRENTES').filter(function(r){return r.activity_id===aid;});
  const ids={};fronts.forEach(function(r){ids[r.workstream_id]=true;});
  const assignments=cudoEventAssignmentRows_(CUDO_EVENT_ASSIGNMENT_SHEET_ID_,'RESPONSABLES').filter(function(r){return ids[r.workstream_id];});
  const tasks=cudoEventAssignmentRows_(CUDO_EVENT_ASSIGNMENT_SHEET_ID_,'TAREAS').filter(function(r){return ids[r.workstream_id];});
  const events=cudoEventAssignmentRows_(CUDO_EVENT_ASSIGNMENT_SHEET_ID_,'EVENTOS').filter(function(r){return r.activity_id===aid;}).slice(-60).reverse();
  const byWs={};assignments.forEach(function(a){byWs[a.workstream_id]=a;});
  const tasksByWs={};tasks.forEach(function(t){(tasksByWs[t.workstream_id]||(tasksByWs[t.workstream_id]=[])).push(t);});
  return {
    activity:activity,
    workstreams:fronts.map(function(f){
      return Object.assign({},f,{assignment:byWs[f.workstream_id]||{},tasks:tasksByWs[f.workstream_id]||[]});
    }),
    events:events,
    people:cudoEventAssignablePeople_()
  };
}

function cudoEventAssignmentUpdateById_(sheetName,idColumn,idValue,changes){
  const sh=SpreadsheetApp.openById(CUDO_EVENT_ASSIGNMENT_SHEET_ID_).getSheetByName(sheetName);
  if(!sh) throw new Error('Hoja no encontrada: '+sheetName);
  const values=sh.getDataRange().getDisplayValues();
  const h=values[0],idIdx=h.indexOf(idColumn);
  if(idIdx<0) throw new Error('Columna ID no encontrada: '+idColumn);
  let row=-1;
  for(let i=1;i<values.length;i++) if(String(values[i][idIdx])===String(idValue)){row=i+1;break;}
  if(row<0) throw new Error('Registro no encontrado: '+idValue);
  Object.keys(changes).forEach(function(k){
    const idx=h.indexOf(k);
    if(idx<0) throw new Error('Columna no encontrada: '+k);
    sh.getRange(row,idx+1).setValue(changes[k]);
  });
}

function cudoEventAssignmentAppendEvent_(activityId,workstreamId,type,actorRef,previousState,newState,comment){
  const sh=SpreadsheetApp.openById(CUDO_EVENT_ASSIGNMENT_SHEET_ID_).getSheetByName('EVENTOS');
  if(!sh) throw new Error('EVENTOS no existe');
  const ts=Utilities.formatDate(new Date(),'America/Santiago',"yyyy-MM-dd'T'HH:mm:ssXXX");
  sh.appendRow([
    'QA-EVT-PRIVATE-'+Utilities.getUuid().slice(0,8).toUpperCase(),
    activityId,workstreamId,'',ts,type,'PERSON',actorRef,
    previousState||'',newState||'',comment||'','SYNTHETIC'
  ]);
}

function cudoEventAssignmentEsc_(v){return cudoPersonaEsc_(v);}

function cudoEventAssignmentRender_(message,activityId){
  const reviewer=cudoPersonaReviewer_();
  const aid=String(activityId||'').trim();
  const activities=cudoEventAssignmentRows_(CUDO_EVENT_ASSIGNMENT_SHEET_ID_,'ACTIVIDADES')
    .sort(function(a,b){return String(a.starts_at||'').localeCompare(String(b.starts_at||''));});

  if(!aid){
    const cards=activities.map(function(a){
      return '<article class="card"><div class="meta">'+cudoEventAssignmentEsc_(a.starts_at||'Sin fecha')+' · '+cudoEventAssignmentEsc_(a.activity_type||'ACTIVITY')+'</div>'+
        '<h2>'+cudoEventAssignmentEsc_(a.title||a.activity_id)+'</h2>'+
        '<p><b>Estado:</b> '+cudoEventAssignmentEsc_(a.status||'')+'</p>'+
        '<a class="button" href="?view=assignments&activity='+encodeURIComponent(a.activity_id)+'">Revisar y asignar →</a></article>';
    }).join('');
    return HtmlService.createHtmlOutput('<!doctype html><html><head><base target="_top"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CUDO · Asignar trabajo</title>'+
      '<style>body{margin:0;background:#f4f2ed;color:#03163d;font-family:Arial,sans-serif}.head{background:#03163d;color:#fff;border-bottom:6px solid #e21b2d;padding:28px 18px}.wrap{max-width:900px;margin:auto}.content{padding:22px 18px 50px}.card{background:#fff;border-radius:18px;padding:20px;margin:14px 0;border:1px solid #c8d0dc;box-shadow:0 8px 24px rgba(3,22,61,.08)}.card h2{margin:5px 0 10px}.meta{font-size:12px;color:#56657d}.button{display:inline-block;background:#03163d;color:#fff;text-decoration:none;border-radius:10px;padding:11px 13px;font-weight:800}.msg{background:#e7f6ee;border-left:4px solid #0a7b48;padding:12px 14px;margin-bottom:14px}</style></head><body>'+
      '<header class="head"><div class="wrap"><small>C.U.D.O. · Administración privada</small><h1>Revisar y asignar trabajo</h1><p>Acceso autorizado: '+cudoEventAssignmentEsc_(reviewer)+'</p></div></header>'+
      '<main class="wrap content">'+(message?'<div class="msg">'+cudoEventAssignmentEsc_(message)+'</div>':'')+(cards||'<div class="card">No hay actividades.</div>')+'</main></body></html>')
      .setTitle('CUDO · Asignar trabajo').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DENY);
  }

  const state=cudoEventAssignmentState_(aid);
  const options=state.people.map(function(p){return '<option value="'+cudoEventAssignmentEsc_(p.person_ref)+'">'+cudoEventAssignmentEsc_(p.person_display)+'</option>';}).join('');
  const cards=state.workstreams.map(function(w){
    const a=w.assignment||{},tasks=w.tasks||[];
    const assignForm=state.people.length
      ? '<form method="post"><input type="hidden" name="kind" value="EVENT_ASSIGNMENT"><input type="hidden" name="action" value="ASSIGN_PERSON"><input type="hidden" name="activity_id" value="'+cudoEventAssignmentEsc_(aid)+'"><input type="hidden" name="workstream_id" value="'+cudoEventAssignmentEsc_(w.workstream_id)+'"><label>'+(a.person_ref?'Reasignar responsable':'Asignar responsable')+'</label><select name="person_ref" required><option value="">Seleccionar persona…</option>'+options+'</select><button>'+(a.person_ref?'Reasignar':'Asignar')+'</button></form>'
      : '<div class="note">No hay identidades CUDO aprobadas disponibles para asignar.</div>';
    const confirmForm=a.person_ref
      ? '<form method="post"><input type="hidden" name="kind" value="EVENT_ASSIGNMENT"><input type="hidden" name="action" value="CONFIRM_ASSIGNMENT"><input type="hidden" name="activity_id" value="'+cudoEventAssignmentEsc_(aid)+'"><input type="hidden" name="workstream_id" value="'+cudoEventAssignmentEsc_(w.workstream_id)+'"><button class="secondary">Confirmar asignación</button></form>'
      : '';
    const taskList=tasks.length?'<ul>'+tasks.map(function(t){return '<li>'+cudoEventAssignmentEsc_(t.title)+' · '+cudoEventAssignmentEsc_(t.state)+'</li>';}).join('')+'</ul>':'<p class="meta">Sin checklist específico para este frente.</p>';
    return '<article class="card"><div class="meta">'+cudoEventAssignmentEsc_(w.phase||w.activation_reason||'')+'</div><h2>'+cudoEventAssignmentEsc_(w.label)+'</h2>'+
      '<p><b>Responsable:</b> '+cudoEventAssignmentEsc_(a.person_display||'Sin responsable')+' · '+cudoEventAssignmentEsc_(a.assignment_state||'UNASSIGNED')+'</p>'+
      taskList+assignForm+confirmForm+'</article>';
  }).join('');

  return HtmlService.createHtmlOutput('<!doctype html><html><head><base target="_top"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CUDO · Asignar trabajo</title>'+
    '<style>body{margin:0;background:#f4f2ed;color:#03163d;font-family:Arial,sans-serif}.head{background:#03163d;color:#fff;border-bottom:6px solid #e21b2d;padding:28px 18px}.wrap{max-width:900px;margin:auto}.content{padding:22px 18px 50px}.card{background:#fff;border-radius:18px;padding:20px;margin:14px 0;border:1px solid #c8d0dc;box-shadow:0 8px 24px rgba(3,22,61,.08)}.card h2{margin:5px 0 10px}.meta{font-size:12px;color:#56657d}.card label{display:block;font-weight:700;font-size:12px;margin:12px 0 6px}.card select{width:100%;box-sizing:border-box;border:1px solid #aeb8c8;border-radius:10px;padding:10px}.card button{margin-top:9px;border:0;border-radius:10px;padding:11px 13px;font-weight:800;background:#03163d;color:#fff}.card button.secondary{background:#fff;color:#03163d;border:1px solid #03163d}.msg{background:#e7f6ee;border-left:4px solid #0a7b48;padding:12px 14px;margin-bottom:14px}.note{background:#fff8da;border-left:4px solid #f3c53b;padding:12px 14px;margin-top:12px;font-size:12px}.back{color:#03163d;font-weight:800}ul{padding-left:20px}</style></head><body>'+
    '<header class="head"><div class="wrap"><small>C.U.D.O. · Administración privada</small><h1>'+cudoEventAssignmentEsc_(state.activity.title||'Actividad')+'</h1><p>Revisar responsabilidades y asignar personas válidas.</p></div></header>'+
    '<main class="wrap content"><p><a class="back" href="?view=assignments">← Todas las actividades</a></p>'+(message?'<div class="msg">'+cudoEventAssignmentEsc_(message)+'</div>':'')+
    '<div class="note">'+state.people.length+' identidad(es) asignable(s) desde ACTOR operacional + PERSONA ALTA. Las fichas pendientes no aparecen.</div>'+cards+'</main></body></html>')
    .setTitle('CUDO · Asignar trabajo').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DENY);
}

function cudoEventAssignmentHandlePost_(e){
  const reviewer=cudoPersonaReviewer_();
  const action=String(e.parameter.action||'').trim();
  const activityId=String(e.parameter.activity_id||'').trim();
  const workstreamId=String(e.parameter.workstream_id||'').trim();
  if(!/^QA-ACTIVITY-[A-Z0-9_-]+$/.test(activityId)) throw new Error('ACTIVITY_ID inválido');
  if(!/^QA-WS-\d{3}$/.test(workstreamId)) throw new Error('WORKSTREAM_ID inválido');
  const state=cudoEventAssignmentState_(activityId);
  const ws=state.workstreams.find(function(x){return x.workstream_id===workstreamId;});
  if(!ws) throw new Error('La responsabilidad no pertenece a esta actividad');
  const current=ws.assignment||{};
  const now=Utilities.formatDate(new Date(),'America/Santiago',"yyyy-MM-dd'T'HH:mm:ssXXX");

  if(action==='ASSIGN_PERSON'){
    const personRef=String(e.parameter.person_ref||'').trim();
    const person=state.people.find(function(p){return p.person_ref===personRef;});
    if(!person) throw new Error('La persona no está autorizada como identidad asignable');
    const previous=current.person_display||current.person_ref||'';
    cudoEventAssignmentUpdateById_('RESPONSABLES','assignment_id',current.assignment_id,{
      person_ref:person.person_ref,
      person_display:person.person_display,
      assignment_state:'ASSIGNED',
      assigned_at:now,
      confirmed_at:''
    });
    if(ws.state==='REQUIRED_UNASSIGNED') cudoEventAssignmentUpdateById_('FRENTES','workstream_id',workstreamId,{state:'READY'});
    const type=current.person_ref?'ROLE_REASSIGNED':'ROLE_ASSIGNED';
    cudoEventAssignmentAppendEvent_(activityId,workstreamId,type,person.person_ref,previous,person.person_display,(current.person_ref?'Responsabilidad reasignada':'Responsabilidad asignada')+' por '+reviewer);
    SpreadsheetApp.flush();
    return cudoEventAssignmentRender_('Asignación guardada y auditada.',activityId);
  }

  if(action==='CONFIRM_ASSIGNMENT'){
    if(!current.person_ref) throw new Error('No hay persona asignada para confirmar');
    if(!state.people.some(function(p){return p.person_ref===current.person_ref;})) throw new Error('La identidad asignada ya no está habilitada');
    cudoEventAssignmentUpdateById_('RESPONSABLES','assignment_id',current.assignment_id,{assignment_state:'CONFIRMED',confirmed_at:now});
    cudoEventAssignmentAppendEvent_(activityId,workstreamId,'ROLE_ACCEPTED',current.person_ref,current.assignment_state,'CONFIRMED','Asignación confirmada por '+reviewer);
    SpreadsheetApp.flush();
    return cudoEventAssignmentRender_('Asignación confirmada.',activityId);
  }

  throw new Error('Acción de asignación no soportada');
}

function cudoEventAssignmentProbe(){
  const reviewer=cudoPersonaReviewer_();
  const state=cudoEventAssignmentState_(CUDO_EVENT_ASSIGNMENT_DEFAULT_ACTIVITY_ID_);
  return {
    ok:true,
    reviewer:reviewer,
    activity_id:state.activity.activity_id,
    workstreams:state.workstreams.length,
    tasks:state.workstreams.reduce(function(n,w){return n+(w.tasks||[]).length;},0),
    assignable_people:state.people.length,
    all_people_have_stable_ids:state.people.every(function(p){return Boolean(p.person_ref&&p.person_display);}),
    sources:Array.from(new Set(state.people.map(function(p){return p.source;}))).sort(),
    production_write:false
  };
}
