const CUDO_ACTIVITY_QA_SHEET_ID = '1Yf2JeTLY6_Vk9URlV2FoXhuKWyJGcXEePx1OmApEYqA';
const CUDO_ACTIVITY_QA_ACTIVITY_ID = 'QA-ACTIVITY-COMMUNITY-001';

function cudoQaSs_() {
  return SpreadsheetApp.openById(CUDO_ACTIVITY_QA_SHEET_ID);
}

function cudoQaRows_(name) {
  const sh = cudoQaSs_().getSheetByName(name);
  if (!sh) throw new Error('Missing sheet: ' + name);
  const values = sh.getDataRange().getDisplayValues();
  if (!values.length) return [];
  const headers = values[0];
  return values.slice(1).filter(r => r.some(v => String(v).trim() !== '')).map(r => {
    const o = {};
    headers.forEach((h, i) => o[h] = r[i] || '');
    return o;
  });
}

function cudoQaSheet_(name) {
  const sh = cudoQaSs_().getSheetByName(name);
  if (!sh) throw new Error('Missing sheet: ' + name);
  return sh;
}

function cudoQaUpdateById_(sheetName, idColumn, idValue, changes) {
  const sh = cudoQaSheet_(sheetName);
  const values = sh.getDataRange().getDisplayValues();
  if (!values.length) throw new Error('Empty sheet: ' + sheetName);
  const headers = values[0];
  const idIdx = headers.indexOf(idColumn);
  if (idIdx < 0) throw new Error('Missing id column ' + idColumn + ' in ' + sheetName);
  let rowIndex = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idIdx]) === String(idValue)) { rowIndex = i + 1; break; }
  }
  if (rowIndex < 0) throw new Error('Missing row ' + idValue + ' in ' + sheetName);
  Object.keys(changes).forEach(k => {
    const idx = headers.indexOf(k);
    if (idx < 0) throw new Error('Missing column ' + k + ' in ' + sheetName);
    sh.getRange(rowIndex, idx + 1).setValue(changes[k]);
  });
  return rowIndex;
}

function cudoQaAppendEvent_(eventType, workstreamId, taskId, actorType, actorRef, previousState, newState, comment) {
  const sh = cudoQaSheet_('EVENTOS');
  const eventId = 'QA-EVT-WEB-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  const ts = Utilities.formatDate(new Date(), 'America/Santiago', "yyyy-MM-dd'T'HH:mm:ssXXX");
  sh.appendRow([
    eventId,
    CUDO_ACTIVITY_QA_ACTIVITY_ID,
    workstreamId || '',
    taskId || '',
    ts,
    eventType,
    actorType || 'SYSTEM',
    actorRef || 'CUDO_QA_WEB',
    previousState || '',
    newState || '',
    comment || '',
    'SYNTHETIC'
  ]);
  return eventId;
}

function cudoQaFindAssignment_(workstreamId) {
  return cudoQaRows_('RESPONSABLES').find(r => r.workstream_id === workstreamId) || null;
}

function cudoQaFindFront_(workstreamId) {
  return cudoQaRows_('FRENTES').find(r => r.workstream_id === workstreamId) || null;
}

function cudoQaFindTask_(taskId) {
  return cudoQaRows_('TAREAS').find(r => r.task_id === taskId) || null;
}

function getState() {
  const activities = cudoQaRows_('ACTIVIDADES').filter(r => r.activity_id === CUDO_ACTIVITY_QA_ACTIVITY_ID);
  const fronts = cudoQaRows_('FRENTES').filter(r => r.activity_id === CUDO_ACTIVITY_QA_ACTIVITY_ID);
  const assignments = cudoQaRows_('RESPONSABLES');
  const tasks = cudoQaRows_('TAREAS');
  const events = cudoQaRows_('EVENTOS')
    .filter(r => r.activity_id === CUDO_ACTIVITY_QA_ACTIVITY_ID)
    .slice(-80)
    .reverse();

  const assignmentByWs = {};
  assignments.forEach(a => assignmentByWs[a.workstream_id] = a);
  const tasksByWs = {};
  tasks.forEach(t => {
    if (!tasksByWs[t.workstream_id]) tasksByWs[t.workstream_id] = [];
    tasksByWs[t.workstream_id].push(t);
  });

  const workstreams = fronts.map(f => {
    const a = assignmentByWs[f.workstream_id] || {};
    const ts = tasksByWs[f.workstream_id] || [];
    const done = ts.filter(t => t.state === 'DONE').length;
    return Object.assign({}, f, {
      assignment: a,
      tasks: ts,
      task_done: done,
      task_total: ts.length
    });
  });

  return {
    ok: true,
    schema_version: 'CUDO_CLUB_OS_ACTIVITY_GOOGLE_QA_V1',
    provenance: 'SYNTHETIC_QA',
    production_write: false,
    activity: activities[0] || {},
    workstreams: workstreams,
    events: events,
    summary: {
      workstreams: workstreams.length,
      confirmed: workstreams.filter(w => (w.assignment || {}).assignment_state === 'CONFIRMED').length,
      assigned_unconfirmed: workstreams.filter(w => (w.assignment || {}).assignment_state === 'ASSIGNED').length,
      unassigned: workstreams.filter(w => (w.assignment || {}).assignment_state === 'UNASSIGNED').length,
      blocked: workstreams.filter(w => w.state === 'BLOCKED').length,
      done: workstreams.filter(w => w.state === 'DONE').length
    }
  };
}

function cudoQaReset_() {
  const now = Utilities.formatDate(new Date(), 'America/Santiago', "yyyy-MM-dd'T'HH:mm:ssXXX");
  const frontBaseline = {
    'QA-WS-001': {state:'IN_PROGRESS',progress_pct:80},
    'QA-WS-002': {state:'BLOCKED',progress_pct:55},
    'QA-WS-003': {state:'READY',progress_pct:25},
    'QA-WS-004': {state:'REQUIRED_UNASSIGNED',progress_pct:0},
    'QA-WS-005': {state:'DONE',progress_pct:100},
    'QA-WS-006': {state:'READY',progress_pct:30}
  };
  Object.keys(frontBaseline).forEach(id => cudoQaUpdateById_('FRENTES','workstream_id',id,frontBaseline[id]));
  const assignmentBaseline = {
    'QA-ASG-001': {person_ref:'QA-PER-001',person_display:'Persona QA 01',assignment_state:'CONFIRMED',assigned_at:'2026-09-17T20:10:00-03:00',confirmed_at:'2026-09-17T20:14:00-03:00'},
    'QA-ASG-002': {person_ref:'QA-PER-002',person_display:'Persona QA 02',assignment_state:'CONFIRMED',assigned_at:'2026-09-17T20:15:00-03:00',confirmed_at:'2026-09-17T20:18:00-03:00'},
    'QA-ASG-003': {person_ref:'QA-PER-003',person_display:'Persona QA 03',assignment_state:'ASSIGNED',assigned_at:'2026-09-17T20:20:00-03:00',confirmed_at:''},
    'QA-ASG-004': {person_ref:'',person_display:'',assignment_state:'UNASSIGNED',assigned_at:'',confirmed_at:''},
    'QA-ASG-005': {person_ref:'QA-PER-004',person_display:'Persona QA 04',assignment_state:'CONFIRMED',assigned_at:'2026-09-17T19:45:00-03:00',confirmed_at:'2026-09-17T19:50:00-03:00'},
    'QA-ASG-006': {person_ref:'QA-PER-005',person_display:'Persona QA 05',assignment_state:'CONFIRMED',assigned_at:'2026-09-17T20:25:00-03:00',confirmed_at:'2026-09-17T20:28:00-03:00'}
  };
  Object.keys(assignmentBaseline).forEach(id => cudoQaUpdateById_('RESPONSABLES','assignment_id',id,assignmentBaseline[id]));
  const taskBaseline = {
    'QA-TASK-001':'DONE','QA-TASK-002':'TODO','QA-TASK-003':'DONE','QA-TASK-004':'BLOCKED',
    'QA-TASK-005':'TODO','QA-TASK-006':'TODO','QA-TASK-007':'DONE','QA-TASK-008':'TODO'
  };
  Object.keys(taskBaseline).forEach(id => cudoQaUpdateById_('TAREAS','task_id',id,{state:taskBaseline[id],updated_at:now}));
  cudoQaAppendEvent_('ACTIVITY_UPDATED','','','SYSTEM','CUDO_QA_WEB','','IN_PREPARATION','Escenario QA restaurado a baseline');
}

function applyAction(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid payload');
  const action = String(payload.action || '');
  const workstreamId = String(payload.workstreamId || '');
  const taskId = String(payload.taskId || '');

  if (action === 'RESET_FIXTURE') {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try { cudoQaReset_(); SpreadsheetApp.flush(); return getState(); }
    finally { lock.releaseLock(); }
  }

  if (workstreamId && !/^QA-WS-\d{3}$/.test(workstreamId)) throw new Error('Only synthetic QA workstreams are allowed');
  if (taskId && !/^QA-TASK-\d{3}$/.test(taskId)) throw new Error('Only synthetic QA tasks are allowed');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const now = Utilities.formatDate(new Date(), 'America/Santiago', "yyyy-MM-dd'T'HH:mm:ssXXX");

    if (action === 'ASSIGN_DEMO') {
      const a = cudoQaFindAssignment_(workstreamId);
      if (!a) throw new Error('Assignment not found');
      cudoQaUpdateById_('RESPONSABLES','assignment_id',a.assignment_id,{
        person_ref:'QA-VISITOR',
        person_display:'Tú (demo)',
        assignment_state:'ASSIGNED',
        assigned_at:now,
        confirmed_at:''
      });
      cudoQaUpdateById_('FRENTES','workstream_id',workstreamId,{state:'READY'});
      cudoQaAppendEvent_('ROLE_ASSIGNED',workstreamId,'','PERSON','QA-VISITOR',a.assignment_state,'ASSIGNED','Responsabilidad tomada desde la web QA');
    } else if (action === 'CONFIRM') {
      const a = cudoQaFindAssignment_(workstreamId);
      if (!a) throw new Error('Assignment not found');
      cudoQaUpdateById_('RESPONSABLES','assignment_id',a.assignment_id,{assignment_state:'CONFIRMED',confirmed_at:now});
      cudoQaAppendEvent_('ROLE_ACCEPTED',workstreamId,'','PERSON',a.person_ref || 'QA-VISITOR',a.assignment_state,'CONFIRMED','Responsabilidad confirmada desde la web QA');
    } else if (action === 'REPORT_BLOCKER') {
      const f = cudoQaFindFront_(workstreamId);
      if (!f) throw new Error('Workstream not found');
      cudoQaUpdateById_('FRENTES','workstream_id',workstreamId,{state:'BLOCKED'});
      cudoQaAppendEvent_('BLOCKER_REPORTED',workstreamId,'','PERSON','QA-VISITOR',f.state,'BLOCKED','Bloqueo sintético informado desde la web QA');
    } else if (action === 'RESOLVE_BLOCKER') {
      const f = cudoQaFindFront_(workstreamId);
      if (!f) throw new Error('Workstream not found');
      cudoQaUpdateById_('FRENTES','workstream_id',workstreamId,{state:'IN_PROGRESS'});
      cudoQaAppendEvent_('BLOCKER_RESOLVED',workstreamId,'','PERSON','QA-VISITOR',f.state,'IN_PROGRESS','Bloqueo sintético resuelto desde la web QA');
    } else if (action === 'COMPLETE_TASK') {
      const t = cudoQaFindTask_(taskId);
      if (!t) throw new Error('Task not found');
      cudoQaUpdateById_('TAREAS','task_id',taskId,{state:'DONE',updated_at:now});
      cudoQaAppendEvent_('TASK_COMPLETED',t.workstream_id,taskId,'PERSON','QA-VISITOR',t.state,'DONE','Tarea sintética completada desde la web QA');
    } else {
      throw new Error('Unsupported action');
    }
    SpreadsheetApp.flush();
    return getState();
  } finally {
    lock.releaseLock();
  }
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return jsonOutput_({ok:true,state:applyAction(payload)});
  } catch (err) {
    return jsonOutput_({ok:false,error:String(err && err.message || err)});
  }
}

function doGet(e) {
  if (e && e.parameter && e.parameter.format === 'json') return jsonOutput_(getState());
  const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#03163d"><title>CUDO · Actividades QA</title>' +
  '<style>*{box-sizing:border-box}body{margin:0;background:#f4f2ed;color:#172033;font-family:Arial,Helvetica,sans-serif}.hero{background:#03163d;color:#fff;border-bottom:6px solid #e21b2d;padding:26px 18px}.wrap{max-width:900px;margin:auto}.ey{font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.hero h1{font-size:clamp(32px,8vw,52px);line-height:.95;margin:8px 0;text-transform:uppercase}.hero p{margin:0;color:#e8edf8;line-height:1.45}.qa{margin:18px 0;background:#fff4cf;border-left:4px solid #c79b00;padding:12px 14px;border-radius:0 12px 12px 0;font-size:12px;line-height:1.5}.body{padding:0 18px 36px}.tabs{display:flex;gap:7px;overflow:auto;margin-bottom:16px}.tabs button,.btn{min-height:42px;border-radius:10px;padding:9px 12px;border:1px solid #c8d0dc;background:#fff;color:#03163d;font-weight:800}.tabs button.active,.btn.primary{background:#03163d;color:#fff;border-color:#03163d}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:14px}.stat,.card{background:#fff;border:1px solid #d2d8e1;border-radius:15px;padding:14px}.stat strong{display:block;font-size:24px;color:#03163d}.stat span{font-size:10px;color:#64748b;font-weight:900;text-transform:uppercase}.card{margin-top:9px}.top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.name{font-size:17px;font-weight:900;color:#03163d;text-transform:uppercase}.meta{font-size:12px;color:#64748b;margin-top:4px;line-height:1.4}.badge{border-radius:999px;padding:5px 8px;font-size:10px;font-weight:900;white-space:nowrap}.ok{background:#e8f6ed;color:#177245}.warn{background:#fff4cf;color:#956200}.bad{background:#fdecec;color:#a51c30}.progress{height:8px;background:#e8ebf0;border-radius:999px;overflow:hidden;margin-top:10px}.progress span{display:block;height:100%;background:#03163d}.actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}.row{padding:11px 0;border-top:1px solid #e6e9ee}.row:first-child{border-top:0}.timeline{border-left:2px solid #cfd6df;margin-left:7px;padding-left:16px}.event{position:relative;padding:0 0 14px}.event:before{content:"";position:absolute;width:10px;height:10px;border-radius:50%;background:#03163d;left:-22px;top:3px}.event strong{font-size:12px;color:#03163d}.event span{display:block;font-size:11px;color:#64748b;margin-top:3px}.hidden{display:none}.loading{padding:30px;text-align:center;color:#64748b}.error{background:#fdecec;color:#8f1d2c;border-radius:12px;padding:12px}.footer{font-size:11px;color:#64748b;margin-top:16px}.sectiontitle{font-size:20px;font-weight:900;color:#03163d;text-transform:uppercase;margin:4px 0 8px}@media(max-width:680px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.top{flex-direction:column}.actions .btn{width:100%}}</style></head><body>' +
  '<header class="hero"><div class="wrap"><div class="ey">C.U.D.O. · Club OS · QA</div><h1>Seguimiento de actividades</h1><p id="activityTitle">Cargando actividad…</p></div></header><main class="wrap body">' +
  '<div class="qa"><strong>POC sintética:</strong> esta pantalla lee y escribe directamente en un Google Sheet QA de CUDO. No contiene personas reales ni modifica producción.</div>' +
  '<div class="tabs"><button class="active" data-view="summary">Resumen</button><button data-view="owners">Responsables</button><button data-view="tasks">Seguimiento</button><button data-view="history">Historial</button></div>' +
  '<div id="loading" class="loading">Leyendo Google Sheets…</div><div id="error" class="error hidden"></div><section id="summary" class="hidden"></section><section id="owners" class="hidden"></section><section id="tasks" class="hidden"></section><section id="history" class="hidden"></section>' +
  '<div class="actions"><button id="reset" class="btn">Restaurar escenario QA</button><button id="reload" class="btn">Recargar desde Google</button></div><div class="footer">Backend: Google Sheets · Historial persistente en EVENTOS · Datos SYNTHETIC_QA</div></main>' +
  '<script>(function(){var state=null;var views=["summary","owners","tasks","history"];function esc(v){return String(v==null?"":v).replace(/[&<>"]/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c])})}function badge(v){var c=(v==="CONFIRMED"||v==="DONE"||v==="IN_PROGRESS")?"ok":(v==="ASSIGNED"||v==="READY")?"warn":"bad";return "<span class=\\"badge "+c+"\\">"+esc(v)+"</span>"}function call(action,ws,task){setBusy(true);google.script.run.withSuccessHandler(function(s){state=s;render();setBusy(false)}).withFailureHandler(fail).applyAction({action:action,workstreamId:ws||"",taskId:task||""})}function setBusy(b){document.getElementById("loading").classList.toggle("hidden",!b)}function fail(e){setBusy(false);var x=document.getElementById("error");x.textContent="Error QA: "+(e&&e.message?e.message:e);x.classList.remove("hidden")}function load(){setBusy(true);google.script.run.withSuccessHandler(function(s){state=s;render();setBusy(false)}).withFailureHandler(fail).getState()}function render(){if(!state)return;document.getElementById("activityTitle").textContent=(state.activity.title||"Actividad QA")+" · "+(state.activity.starts_at||"");var sum=state.summary;document.getElementById("summary").innerHTML="<div class=\\"stats\\"><div class=\\"stat\\"><strong>"+sum.workstreams+"</strong><span>frentes</span></div><div class=\\"stat\\"><strong>"+sum.confirmed+"</strong><span>confirmados</span></div><div class=\\"stat\\"><strong>"+sum.unassigned+"</strong><span>sin responsable</span></div><div class=\\"stat\\"><strong>"+sum.blocked+"</strong><span>bloqueados</span></div></div><div class=\\"sectiontitle\\">Estado actual</div>"+state.workstreams.map(frontCard).join("");document.getElementById("owners").innerHTML="<div class=\\"sectiontitle\\">Quién responde por qué</div><div class=\\"card\\">"+state.workstreams.map(ownerRow).join("")+"</div>";document.getElementById("tasks").innerHTML="<div class=\\"sectiontitle\\">Pendientes y ejecución</div>"+state.workstreams.map(taskCard).join("");document.getElementById("history").innerHTML="<div class=\\"sectiontitle\\">Historial persistido</div><div class=\\"card\\"><div class=\\"timeline\\">"+state.events.map(eventRow).join("")+"</div></div>";document.querySelector(".tabs button.active").click()}function frontCard(w){var a=w.assignment||{};var owner=a.person_display||"Nadie se ha hecho responsable";var pct=parseInt(w.progress_pct||"0",10)||0;var buttons=[];if(a.assignment_state==="UNASSIGNED")buttons.push("<button class=\\"btn primary\\" onclick=\\"cudoAct('ASSIGN_DEMO','"+w.workstream_id+"')\\">Me hago responsable (demo)</button>");if(a.assignment_state==="ASSIGNED")buttons.push("<button class=\\"btn primary\\" onclick=\\"cudoAct('CONFIRM','"+w.workstream_id+"')\\">Confirmar responsabilidad</button>");if(w.state==="BLOCKED")buttons.push("<button class=\\"btn\\" onclick=\\"cudoAct('RESOLVE_BLOCKER','"+w.workstream_id+"')\\">Resolver bloqueo</button>");else if(w.state!=="DONE")buttons.push("<button class=\\"btn\\" onclick=\\"cudoAct('REPORT_BLOCKER','"+w.workstream_id+"')\\">Informar bloqueo</button>");return "<div class=\\"card\\"><div class=\\"top\\"><div><div class=\\"name\\">"+esc(w.label)+"</div><div class=\\"meta\\">Responsable: "+esc(owner)+" · "+esc(a.assignment_state||"UNASSIGNED")+" · "+w.task_done+"/"+w.task_total+" tareas</div></div>"+badge(w.state)+"</div><div class=\\"progress\\"><span style=\\"width:"+pct+"%\\"></span></div><div class=\\"actions\\">"+buttons.join("")+"</div></div>"}function ownerRow(w){var a=w.assignment||{};return "<div class=\\"row\\"><div class=\\"name\\">"+esc(w.label)+"</div><div class=\\"meta\\">"+esc(a.person_display||"SIN RESPONSABLE")+" · "+esc(a.display_role||"")+"</div>"+badge(a.assignment_state||"UNASSIGNED")+"</div>"}function taskCard(w){return "<div class=\\"card\\"><div class=\\"name\\">"+esc(w.label)+"</div>"+(w.tasks.length?w.tasks.map(function(t){var b=t.state!=="DONE"?"<button class=\\"btn\\" onclick=\\"cudoTask('"+t.task_id+"')\\">Marcar lista</button>":"";return "<div class=\\"row\\"><div><strong>"+esc(t.title)+"</strong><div class=\\"meta\\">"+esc(t.due_at)+" · "+esc(t.assignee_display||"Sin asignar")+"</div></div>"+badge(t.state)+b+"</div>"}).join(""):"<div class=\\"meta\\">Sin tareas</div>")+"</div>"}function eventRow(e){return "<div class=\\"event\\"><strong>"+esc(e.timestamp)+" · "+esc(e.event_type)+"</strong><span>"+esc(e.comment)+" · actor "+esc(e.actor_ref)+" · "+esc(e.previous_state)+" → "+esc(e.new_state)+"</span></div>"}window.cudoAct=function(a,w){call(a,w,"")};window.cudoTask=function(t){var found=null;state.workstreams.some(function(w){return w.tasks.some(function(x){if(x.task_id===t){found=w.workstream_id;return true}return false})});call("COMPLETE_TASK",found||"",t)};document.querySelectorAll(".tabs button").forEach(function(b){b.addEventListener("click",function(){document.querySelectorAll(".tabs button").forEach(function(x){x.classList.toggle("active",x===b)});views.forEach(function(v){document.getElementById(v).classList.toggle("hidden",v!==b.dataset.view)})})});document.getElementById("reload").onclick=load;document.getElementById("reset").onclick=function(){call("RESET_FIXTURE","","")};load()})();</script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle('CUDO · Actividades QA')
    .addMetaTag('viewport','width=device-width,initial-scale=1,viewport-fit=cover');
}
