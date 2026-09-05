function ensurePartidosBranchingQA(){
  const formId='1ZujRoboJGqqkKQJBwJeD1UNMiIYnDzstSWL24n_TtCA';
  const form=FormApp.openById(formId);
  const byTitle=title=>form.getItems().find(i=>String(i.getTitle()||'').trim()===title);
  const state=byTitle('Estado del partido');
  const goalsLocal=byTitle('Goles del equipo local');
  const goalsVisit=byTitle('Goles del equipo visitante');
  const source=byTitle('¿De dónde proviene esta información?');
  if(!state||state.getType()!==FormApp.ItemType.LIST)throw new Error('Partidos: no se encontró la pregunta LISTA “Estado del partido”');
  if(!goalsLocal||!goalsVisit||!source)throw new Error('Partidos: faltan preguntas necesarias para la ramificación');

  let resultPage=form.getItems(FormApp.ItemType.PAGE_BREAK).map(i=>i.asPageBreakItem()).find(i=>i.getTitle()==='Resultado final');
  let commonPage=form.getItems(FormApp.ItemType.PAGE_BREAK).map(i=>i.asPageBreakItem()).find(i=>i.getTitle()==='Confirmación y fuente');
  if(!resultPage)resultPage=form.addPageBreakItem().setTitle('Resultado final').setHelpText('Completa el marcador sólo cuando el partido haya finalizado.');
  if(!commonPage)commonPage=form.addPageBreakItem().setTitle('Confirmación y fuente').setHelpText('Revisa los datos y deja la fuente o una observación antes de enviar.');

  // Reubicar sólo elementos de diseño; las preguntas conservan sus IDs y por tanto su columna de respuesta.
  form.moveItem(resultPage,goalsLocal.getIndex());
  form.moveItem(commonPage,source.getIndex());

  const list=state.asListItem();
  list.setChoices([
    list.createChoice('PROGRAMADO',commonPage),
    list.createChoice('FINALIZADO',resultPage),
    list.createChoice('SUSPENDIDO',commonPage),
    list.createChoice('CANCELADO',commonPage)
  ]);
  resultPage.setGoToPage(commonPage);
  commonPage.setGoToPage(FormApp.PageNavigationType.SUBMIT);
  form.setAcceptingResponses(true);

  const pages=form.getItems(FormApp.ItemType.PAGE_BREAK).map(i=>({title:i.getTitle(),index:i.getIndex()}));
  return {ok:true,formId:form.getId(),questionType:String(state.getType()),pages,choices:list.getChoices().map(c=>({value:c.getValue(),navigationType:String(c.getPageNavigationType())}))};
}
