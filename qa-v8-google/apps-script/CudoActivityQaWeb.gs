const CUDO_ACTIVITY_QA_SHEET_ID = '1Yf2JeTLY6_Vk9URlV2FoXhuKWyJGcXEePx1OmApEYqA';
const CUDO_ACTIVITY_QA_ACTIVITY_ID = 'QA-ACTIVITY-BINGO-002';

function cudoQaSs_() {
  return SpreadsheetApp.openById(CUDO_ACTIVITY_QA_SHEET_ID);
}

function cudoQaRows_(name) {
  const sh = cudoQaSs_().getSheetByName(name);
  if (!sh) throw new Error('Missing sheet: ' + name);
  const values = sh.getDataRange().getDisplayValues();
  if (!values.length) return [];
  const headers = values[0];
  return values.slice(1)
    .filter(r => r.some(v => String(v).trim() !== ''))
    .map(r => {
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
    if (String(values[i][idIdx]) === String(idValue)) {
      rowIndex = i + 1;
      break;
    }
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
  const validWorkstreamIds = new Set(fronts.map(f => f.workstream_id));
  const events = cudoQaRows_('EVENTOS')
    .filter(r =>
      r.activity_id === CUDO_ACTIVITY_QA_ACTIVITY_ID &&
      (!r.workstream_id || validWorkstreamIds.has(r.workstream_id))
    )
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
    return Object.assign({}, f, {
      assignment: a,
      tasks: ts,
      task_done: ts.filter(t => t.state === 'DONE').length,
      task_total: ts.length
    });
  });

  return {
    ok: true,
    schema_version: 'CUDO_CLUB_OS_ACTIVITY_GOOGLE_QA_V1',
    provenance: 'SYNTHETIC_QA',
    production_write: false,
    activity: activities[0] || {},
    workstreams,
    events,
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
    'QA-WS-101': {state:'IN_PROGRESS',progress_pct:65},
    'QA-WS-102': {state:'BLOCKED',progress_pct:45},
    'QA-WS-103': {state:'READY',progress_pct:35},
    'QA-WS-104': {state:'REQUIRED_UNASSIGNED',progress_pct:0},
    'QA-WS-105': {state:'IN_PROGRESS',progress_pct:70},
    'QA-WS-106': {state:'READY',progress_pct:50},
    'QA-WS-107': {state:'IN_PROGRESS',progress_pct:60},
    'QA-WS-108': {state:'READY',progress_pct:30}
  };
  Object.keys(frontBaseline).forEach(id =>
    cudoQaUpdateById_('FRENTES','workstream_id',id,frontBaseline[id])
  );

  const assignmentBaseline = {
    'QA-ASG-101': {person_ref:'QA-PER-101',person_display:'Persona QA 01',assignment_state:'CONFIRMED',assigned_at:'2026-09-18T00:10:00-03:00',confirmed_at:'2026-09-18T00:15:00-03:00'},
    'QA-ASG-102': {person_ref:'QA-PER-102',person_display:'Persona QA 02',assignment_state:'CONFIRMED',assigned_at:'2026-09-18T00:16:00-03:00',confirmed_at:'2026-09-18T00:20:00-03:00'},
    'QA-ASG-103': {person_ref:'QA-PER-103',person_display:'Persona QA 03',assignment_state:'ASSIGNED',assigned_at:'2026-09-18T00:22:00-03:00',confirmed_at:''},
    'QA-ASG-104': {person_ref:'',person_display:'',assignment_state:'UNASSIGNED',assigned_at:'',confirmed_at:''},
    'QA-ASG-105': {person_ref:'QA-PER-104',person_display:'Persona QA 04',assignment_state:'CONFIRMED',assigned_at:'2026-09-18T00:25:00-03:00',confirmed_at:'2026-09-18T00:28:00-03:00'},
    'QA-ASG-106': {person_ref:'QA-PER-105',person_display:'Persona QA 05',assignment_state:'CONFIRMED',assigned_at:'2026-09-18T00:30:00-03:00',confirmed_at:'2026-09-18T00:34:00-03:00'},
    'QA-ASG-107': {person_ref:'QA-PER-106',person_display:'Persona QA 06',assignment_state:'CONFIRMED',assigned_at:'2026-09-18T00:35:00-03:00',confirmed_at:'2026-09-18T00:38:00-03:00'},
    'QA-ASG-108': {person_ref:'QA-PER-107',person_display:'Persona QA 07',assignment_state:'CONFIRMED',assigned_at:'2026-09-18T00:40:00-03:00',confirmed_at:'2026-09-18T00:44:00-03:00'}
  };
  Object.keys(assignmentBaseline).forEach(id =>
    cudoQaUpdateById_('RESPONSABLES','assignment_id',id,assignmentBaseline[id])
  );

  const taskBaseline = {
    'QA-TASK-101':'DONE','QA-TASK-102':'IN_PROGRESS','QA-TASK-103':'TODO',
    'QA-TASK-104':'DONE','QA-TASK-105':'DONE','QA-TASK-106':'BLOCKED','QA-TASK-107':'TODO',
    'QA-TASK-108':'DONE','QA-TASK-109':'TODO','QA-TASK-110':'TODO',
    'QA-TASK-111':'TODO','QA-TASK-112':'TODO','QA-TASK-113':'TODO',
    'QA-TASK-114':'DONE','QA-TASK-115':'IN_PROGRESS','QA-TASK-116':'DONE','QA-TASK-117':'TODO',
    'QA-TASK-118':'DONE','QA-TASK-119':'TODO','QA-TASK-120':'TODO',
    'QA-TASK-121':'DONE','QA-TASK-122':'IN_PROGRESS','QA-TASK-123':'TODO',
    'QA-TASK-124':'DONE','QA-TASK-125':'TODO','QA-TASK-126':'TODO'
  };
  Object.keys(taskBaseline).forEach(id =>
    cudoQaUpdateById_('TAREAS','task_id',id,{state:taskBaseline[id],updated_at:now})
  );

  cudoQaAppendEvent_(
    'ACTIVITY_UPDATED','','','SYSTEM','CUDO_QA_WEB',
    '','IN_PREPARATION','Escenario Bingo CUDO QA restaurado a baseline DEMO V2'
  );
}

function applyAction(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid payload');

  const action = String(payload.action || '');
  const workstreamId = String(payload.workstreamId || '');
  const taskId = String(payload.taskId || '');

  if (action === 'RESET_FIXTURE') {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      cudoQaReset_();
      SpreadsheetApp.flush();
      return getState();
    } finally {
      lock.releaseLock();
    }
  }

  if (workstreamId && !/^QA-WS-\d{3}$/.test(workstreamId)) {
    throw new Error('Only synthetic QA workstreams are allowed');
  }
  if (taskId && !/^QA-TASK-\d{3}$/.test(taskId)) {
    throw new Error('Only synthetic QA tasks are allowed');
  }

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
      cudoQaUpdateById_('RESPONSABLES','assignment_id',a.assignment_id,{
        assignment_state:'CONFIRMED',
        confirmed_at:now
      });
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

function cudoQaJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return cudoQaJson_({ok:true,state:applyAction(payload)});
  } catch (err) {
    return cudoQaJson_({ok:false,error:String(err && err.message || err)});
  }
}

function doGet(e) {
  if (e && e.parameter && e.parameter.format === 'json') {
    return cudoQaJson_(getState());
  }

  return HtmlService
    .createHtmlOutputFromFile('CudoActivityQaView')
    .setTitle('CUDO · Actividades QA')
    .addMetaTag('viewport','width=device-width,initial-scale=1,viewport-fit=cover');
}
