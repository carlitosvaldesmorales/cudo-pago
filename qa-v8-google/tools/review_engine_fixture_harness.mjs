import assert from 'node:assert/strict';
import {
  MODULES, REVIEW_SHEET_ID, canonicalDecision, processReviewDecisions,
  resolveContentType, resolveCorrectionField, transition
} from './process_review_decisions.mjs';

const HEADERS=['ID_REVISION','FECHA','TIPO_CONTENIDO','IDENTIFICADOR_HUMANO','DECISION','AUTORIZACION_PUBLICACION','AUTORIZACION_MENORES','OBSERVACIONES','REVISOR','ESTADO_PROCESO','ID_RESUELTO','COINCIDENCIAS','RESULTADO','FECHA_APLICACION','CAMPO_CORRECCION','NUEVO_VALOR'];
const STANDARD=['ID','ESTADO','PUBLICAR','PRIVACIDAD','AUTORIZACION','REVISOR','FECHA_REVISION','OBSERVACIONES'];
const GALLERY=['ID','ESTADO','PUBLICAR','PRIVACIDAD','AUTORIZACION_PUBLICACION','AUTORIZACION_MENORES','REVISOR','FECHA_REVISION'];

const sheets={
  AUDIT:[HEADERS,
    ['r1','2026-09-15','NOTICIA','Noticia de prueba','Aprobar publicación','SI','NO APLICA','Publicar noticia','qa-agent',''],
    ['r2','2026-09-15','Equipo / Serie','Primera CUDO','Rechazar publicación','NO','NO APLICA','Rechazo seguro','qa-agent',''],
    ['r3','2026-09-15','Jugador / Plantel','Jugador Uno','Aprobar retiro','SI','NO APLICA','Retiro temporal','qa-agent',''],
    ['r4','2026-09-15','Partido / Resultado','CUDO vs Rival 2026-09-20','Aprobar corrección','SI','NO APLICA','QA cambio de cancha','qa-editor','','','','','','Recinto','Cancha Nueva'],
    ['r5','2026-09-15','Tabla de posiciones','CUDO','Aprobar reactivación','SI','NO APLICA','Reactivar tabla','qa-agent',''],
    ['r6','2026-09-15','Galería','QA-GAL-001','Aprobar publicación','SI','NO APLICA','Foto sin menores','qa-agent',''],
    ['r7','2026-09-15','Galería','QA-GAL-002','Aprobar publicación','SI','NO','Foto con menores sin autorización','qa-agent',''],
    ['r8','2026-09-15','NOTICIA','No existe','Aprobar publicación','SI','NO APLICA','','qa-agent',''],
    ['r9','2026-09-15','NOTICIA','Noticia de prueba','Aprobar publicación','SI','NO APLICA','','qa-agent','APLICADO']
  ],
  NOTICIA:{
    operational:[['ID_NOTICIA','FECHA','SLUG','TITULO','RESUMEN','CUERPO','IMAGEN_REF','ESTADO','PUBLICAR','FUENTE','CLASIFICACION','PRIVACIDAD','RESPONSABLE','FECHA_REVISION','OBSERVACIONES','AUTORIZACION_PUBLICACION'],
      ['QA-NOT-001','2026-09-15','noticia-prueba','Noticia de prueba','Resumen','Texto','img.jpg','','','','','','','','','']],
    revision:[STANDARD],
    corrections:[MODULES.NOTICIA.correctionsHeaders]
  },
  EQUIPO:{
    operational:[['ID_EQUIPO','NOMBRE','CATEGORIA','DESCRIPCION','ESTADO_SERIE','ESTADO_REGISTRO','PUBLICAR','PRIVACIDAD','AUTORIZACION_PUBLICACION','CONFIRMACION_CLUB','RESPONSABLE','FECHA_REVISION','OBSERVACIONES'],
      ['QA-EQU-001','Primera CUDO','PRIMERA','Equipo adulto','Activa','','','','','','','','']],
    revision:[STANDARD],corrections:[MODULES.EQUIPO.correctionsHeaders]
  },
  PLANTEL:{
    operational:[['ID_INTERNO','NOMBRE_ORIGEN','CONDICION','NOMBRE_DEPORTIVO_PUBLICO','NUMERO','POSICION','CATEGORIA','FOTO_REF','CAPITAN','ESTADO','PUBLICAR','PRIVACIDAD','AUTORIZACION_PUBLICACION','FUENTE','OBSERVACIONES_VALIDACION'],
      ['QA-JUG-001','','','Jugador Uno','10','VOLANTE','PRIMERA','foto.jpg','NO','','','','','','']],
    revision:[STANDARD,['QA-JUG-001','PUBLICADO','SI','PUBLICO','AUTORIZADO','qa','2026-09-14','']],corrections:[MODULES.PLANTEL.correctionsHeaders]
  },
  PARTIDO:{
    operational:[['ID_PARTIDO','COMPETENCIA','JORNADA','FECHA','HORA','CATEGORIA','LOCAL','VISITA','RECINTO','ESTADO_PARTIDO','GOLES_LOCAL','GOLES_VISITA','ESTADO_REGISTRO','PUBLICAR','PRIVACIDAD','FUENTE','RESPONSABLE','FECHA_REVISION','OBSERVACIONES'],
      ['QA-PAR-001','Campeonato 2026','Fecha 1','2026-09-20','15:00','PRIMERA','CUDO','Rival','Cancha Vieja','PROGRAMADO','','','','','','','','','']],
    revision:[STANDARD,['QA-PAR-001','PUBLICADO','SI','PUBLICO','AUTORIZADO','qa','2026-09-14','']],
    corrections:[MODULES.PARTIDO.correctionsHeaders,
      ['QA-PAR-001','Campeonato 2026','Fecha 1','2026-09-20','15:00','PRIMERA','CUDO','Rival','Cancha Anterior','PROGRAMADO','','','qa','2026-09-14','Corrección previa']]
  },
  TABLA:{
    operational:[['ID_TABLA','COMPETENCIA','CATEGORIA','POSICION','EQUIPO','PJ','PG','PE','PP','GF','GC','DG','PTS','ESTADO_REGISTRO','PUBLICAR','PRIVACIDAD','FUENTE','RESPONSABLE','FECHA_REVISION','OBSERVACIONES'],
      ['QA-TAB-001','Campeonato 2026','PRIMERA','1','CUDO','2','2','0','0','5','1','4','6','','','','','','','']],
    revision:[STANDARD,['QA-TAB-001','RETIRADO','NO','INTERNO','AUTORIZADO','qa','2026-09-14','']],corrections:[MODULES.TABLA.correctionsHeaders]
  },
  GALERIA:{
    operational:[['ID_FOTO','ALBUM_ID','ALBUM','FECHA','CATEGORIA','TITULO','DESCRIPCION','IMAGEN_REF','ALT','CONTIENE_MENORES','AUTORIZACION_MENORES','ESTADO_REGISTRO','PUBLICAR','PRIVACIDAD','AUTORIZACION_PUBLICACION','FUENTE','RESPONSABLE','FECHA_REVISION','OBSERVACIONES'],
      ['QA-GAL-001','album-1','Partido 1','2026-09-15','CLUB','Foto Uno','Descripción','uno.jpg','Jugadores','NO','','','','','','','','',''],
      ['QA-GAL-002','album-2','Partido 2','2026-09-15','CLUB','Foto Dos','Descripción','dos.jpg','Niños','SI','','','','','','','','','']],
    revision:[GALLERY],corrections:[MODULES.GALERIA.correctionsHeaders]
  }
};

const clone=v=>JSON.parse(JSON.stringify(v));
const moduleBySpreadsheet=Object.fromEntries(Object.entries(MODULES).map(([k,v])=>[v.spreadsheetId,k]));
const rangeData=(moduleKey,range,badContractModule)=>{
  const mod=MODULES[moduleKey],fixture=sheets[moduleKey];
  if(range===`${mod.operationalSheet}!A:Z`) return clone(fixture.operational);
  if(range.startsWith(`${mod.revisionSheet}!A:`)){
    const rows=clone(fixture.revision);
    if(moduleKey===badContractModule) rows[0]=['ID','ROTO',...rows[0].slice(2)];
    return rows;
  }
  if(range.startsWith(`${mod.correctionsSheet}!A:`)) return clone(fixture.corrections);
  throw new Error(`Lectura inesperada ${moduleKey}/${range}`);
};
const makeAdapter=(writes,{badContractModule=null}={})=>({
  now:()=> '2026-09-15T11:00:00.000Z',
  readValues:async(spreadsheetId,range)=>{
    if(spreadsheetId===REVIEW_SHEET_ID&&range==='AUDITORIA_REVISION!A:P') return clone(sheets.AUDIT);
    const moduleKey=moduleBySpreadsheet[spreadsheetId];
    if(moduleKey) return rangeData(moduleKey,range,badContractModule);
    throw new Error(`Lectura inesperada ${spreadsheetId}/${range}`);
  },
  updateValues:async(spreadsheetId,range,values)=>{writes.push({op:'update',spreadsheetId,range,values:clone(values)});return{};},
  appendValues:async(spreadsheetId,range,values)=>{writes.push({op:'append',spreadsheetId,range,values:clone(values)});return{};}
});

assert.equal(canonicalDecision('Aprobar publicación'),'PUBLISH');
assert.equal(canonicalDecision('Aprobar retiro'),'RETIRE');
assert.equal(canonicalDecision('Aprobar reactivación'),'REACTIVATE');
assert.equal(canonicalDecision('Aprobar corrección'),'CORRECT');
assert.deepEqual(transition('Aprobar publicación'),['PUBLICADO','SI','PUBLICO','AUTORIZADO']);
assert.deepEqual(transition('Rechazar publicación'),['RECHAZADO','NO','INTERNO','PENDIENTE']);
assert.deepEqual(transition('Aprobar retiro'),['RETIRADO','NO','INTERNO','AUTORIZADO']);
assert.deepEqual(transition('Aprobar reactivación'),['PUBLICADO','SI','PUBLICO','AUTORIZADO']);
assert.deepEqual(transition('Solicitar corrección'),['REQUIERE_CORRECCION','NO','INTERNO','PENDIENTE']);
assert.equal(resolveContentType('Galería'),'GALERIA');
assert.equal(resolveCorrectionField('PARTIDO','Goles de CUDO',{LOCAL:'CUDO',VISITA:'Rival'}),'GOLES_LOCAL');
assert.equal(resolveCorrectionField('PARTIDO','Goles del rival',{LOCAL:'CUDO',VISITA:'Rival'}),'GOLES_VISITA');
assert.equal(resolveCorrectionField('PARTIDO','Equipo o rival',{LOCAL:'Rival',VISITA:'CUDO'}),'LOCAL');

const guarded=[];
await assert.rejects(()=>processReviewDecisions({...makeAdapter(guarded),expectedPending:0}),/Safety gate: decisiones pendientes 8, esperado 0/);
assert.equal(guarded.length,0);

const bad=[];
await assert.rejects(()=>processReviewDecisions(makeAdapter(bad,{badContractModule:'EQUIPO'})),/EQUIPO: REVISION: contrato inesperado/);
assert.equal(bad.length,0,'El preflight debe fallar antes de cualquier escritura');

const dryWrites=[];
const dry=await processReviewDecisions({...makeAdapter(dryWrites),dryRun:true});
assert.equal(dryWrites.length,0,'Dry-run no puede escribir');
assert.equal(dry.pending,8);
assert.equal(dry.mutations.length>0,true);

const writes=[];
const result=await processReviewDecisions(makeAdapter(writes));
assert.equal(result.ok,true);
assert.equal(result.pending,8);
assert.deepEqual(result.preflight_modules.sort(),['EQUIPO','GALERIA','NOTICIA','PARTIDO','PLANTEL','TABLA']);
assert.deepEqual(result.summary.map(x=>x.status),[
  'APLICADO','APLICADO','APLICADO','APLICADO','APLICADO','APLICADO','BLOQUEADO_MENORES_SIN_AUTORIZACION','BLOQUEADO_SIN_COINCIDENCIAS'
]);

const correctionWrite=writes.find(w=>w.spreadsheetId===MODULES.PARTIDO.spreadsheetId&&w.range.startsWith('CORRECCIONES!A2:'));
assert.ok(correctionWrite,'La corrección existente debe actualizarse, no duplicarse');
const correction=correctionWrite.values[0];
const ci=Object.fromEntries(MODULES.PARTIDO.correctionsHeaders.map((h,i)=>[h,i]));
assert.equal(correction[ci.ID],'QA-PAR-001');
assert.equal(correction[ci.RECINTO],'Cancha Nueva');
assert.equal(correction[ci.LOCAL],'CUDO');
assert.equal(correction[ci.VISITA],'Rival');
assert.equal(correction[ci.MOTIVO],'QA cambio de cancha');
assert.equal(writes.some(w=>w.op==='append'&&w.spreadsheetId===MODULES.PARTIDO.spreadsheetId&&w.range.startsWith('CORRECCIONES!')),false,'No debe agregar una segunda corrección del mismo ID');

const galleryRevision=writes.find(w=>w.spreadsheetId===MODULES.GALERIA.spreadsheetId&&w.op==='append'&&w.range.startsWith('REVISION!'));
assert.ok(galleryRevision,'Galería sin menores debe publicar mediante REVISION');
assert.deepEqual(galleryRevision.values[0],['QA-GAL-001','PUBLICADO','SI','PUBLICO','AUTORIZADO','NO APLICA','qa-agent','2026-09-15T11:00:00.000Z']);
assert.equal(writes.some(w=>JSON.stringify(w.values).includes('QA-GAL-002')&&w.spreadsheetId===MODULES.GALERIA.spreadsheetId),false,'Galería con menores sin autorización no debe mutar contenido');

const auditWrites=writes.filter(w=>w.spreadsheetId===REVIEW_SHEET_ID&&w.range.startsWith('AUDITORIA_REVISION!J'));
assert.equal(auditWrites.length,8,'Toda decisión pendiente debe quedar trazada como APLICADO o BLOQUEADO');

console.log(JSON.stringify({
  ok:true,
  mode:'SYNTHETIC_IN_MEMORY_NO_EXTERNAL_WRITES',
  supported_domains:Object.keys(MODULES),
  current_decisions:['Aprobar publicación','Rechazar publicación','Aprobar retiro','Aprobar reactivación','Aprobar corrección'],
  legacy_decisions:['Aprobar y publicar','Rechazar','Solicitar corrección'],
  safety_gate:'PASS_NO_WRITES_ON_PENDING_MISMATCH',
  contract_preflight:'PASS_NO_PARTIAL_WRITES_ON_SCHEMA_DRIFT',
  resolver:'PASS_EXACT_UNIQUE_OR_BLOCK',
  corrections:'PASS_FULL_ROW_OVERLAY_AND_UPDATE_EXISTING',
  gallery_minors:'PASS_BLOCK_WITHOUT_AUTHORIZATION',
  dry_run:'PASS_ZERO_WRITES',
  applied:result.summary.filter(x=>x.status==='APLICADO').length,
  blocked:result.summary.filter(x=>x.status.startsWith('BLOQUEADO_')).length,
  writes:writes.length
},null,2));
